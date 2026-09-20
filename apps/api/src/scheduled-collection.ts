import { readFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { collectionScope, MAX_PUBLIC_EVENT_BYTES, parsePublicEvent, type PublicEvent, type SerializedScheduledCollectionSnapshot } from '@oss-scp/collector-cli';
import { PLATFORM_DB_ENVIRONMENT_KEYS, type CollectionScope, type RecordStorage } from '@oss-scp/platform-db';
import { assertSelfContainedTransform, isLivePostgresDefinition, scheduledCredentialEnvironment, transformDigest, type CollectionDefinition, type CollectionSchedule } from '@oss-scp/plugin-config';
import { nextScheduledInstant } from './collection-schedule';
import { definitionRevision } from './plugin-runtime-registry';

const localRequire = createRequire(__filename);
const MAX_TIMER_DELAY_MS = 12 * 60 * 60 * 1000;
const DEFAULT_SHUTDOWN_GRACE_MS = 5_000;
const DEFAULT_KILL_WAIT_MS = 1_000;
const DEFAULT_RESULT_DRAIN_MS = 1_000;
const RUNTIME_ENVIRONMENT = new Set(['PATH', 'LANG', 'LC_ALL', 'TZ', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY']);
const FORBIDDEN_ENVIRONMENT = /^(?:AUTH|LDAP)_/;

export interface ScheduledCollectionLogger { error(message: string): void }
export interface ScheduledCollectionProcessRequest {
  pluginId: string;
  configRoot: string;
  processPath: string;
  expectedRevision: string;
  scheduledAt: string;
  timezone: string;
  snapshot: SerializedScheduledCollectionSnapshot;
  environment: NodeJS.ProcessEnv;
}
export type SpawnScheduledCollectionProcess = (request: ScheduledCollectionProcessRequest) => ChildProcess;

export function scheduledChildEnvironment(
  parent: Readonly<NodeJS.ProcessEnv>,
  definition: CollectionDefinition,
  metadata: Pick<ScheduledCollectionProcessRequest, 'configRoot' | 'expectedRevision' | 'scheduledAt' | 'timezone'>,
): NodeJS.ProcessEnv {
  const allowed = new Set([...RUNTIME_ENVIRONMENT, ...PLATFORM_DB_ENVIRONMENT_KEYS, ...scheduledCredentialEnvironment(definition)]);
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(parent)) {
    if (value === undefined || FORBIDDEN_ENVIRONMENT.test(key)) continue;
    if (allowed.has(key)) environment[key] = value;
  }
  return {
    ...environment,
    OSS_SCP_CONFIG_ROOT: metadata.configRoot,
    OSS_SCP_COLLECTION_TRIGGER: 'scheduled',
    OSS_SCP_COLLECTION_EXPECTED_REVISION: metadata.expectedRevision,
    OSS_SCP_COLLECTION_SCHEDULED_AT: metadata.scheduledAt,
    OSS_SCP_COLLECTION_SCHEDULE_TIMEZONE: metadata.timezone,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function captureScheduledCollectionSnapshot(definition: CollectionDefinition): SerializedScheduledCollectionSnapshot {
  const source = readFileSync(definition.plugin.transformPath);
  assertSelfContainedTransform(source);
  const digest = transformDigest(source);
  if (!definition.plugin.transformDigest || definition.plugin.transformDigest !== digest) {
    throw new Error(`정기 수집 transform snapshot이 변경되었습니다: ${definition.plugin.id}`);
  }
  return deepFreeze({ definition: structuredClone(definition), transform: { digest, sourceBase64: source.toString('base64') } });
}

const defaultSpawn: SpawnScheduledCollectionProcess = request => {
  const child = spawn(process.execPath, [request.processPath, request.pluginId], {
    env: request.environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin?.on('error', () => undefined);
  child.stdin?.end(JSON.stringify(request.snapshot));
  return child;
};

interface PreparedTarget {
  definition: CollectionDefinition;
  expectedRevision: string;
  snapshot: SerializedScheduledCollectionSnapshot;
}

function waitForClose(child: ChildProcess, timeoutMs: number, alreadyClosed: () => boolean): Promise<boolean> {
  if (alreadyClosed()) return Promise.resolve(true);
  return new Promise(resolve => {
    const closed = () => { clearTimeout(timer); resolve(true); };
    const timer = setTimeout(() => { child.removeListener('close', closed); resolve(false); }, timeoutMs);
    timer.unref?.();
    child.once('close', closed);
  });
}

function drainResults(results: readonly Promise<void>[], timeoutMs: number): Promise<void> {
  if (results.length === 0) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(resolve, timeoutMs);
    void Promise.allSettled(results).then(() => { clearTimeout(timer); resolve(); });
  });
}

export class ScheduledCollectionManager {
  private readonly children = new Set<ChildProcess>();
  private readonly closedChildren = new WeakSet<ChildProcess>();
  private readonly resultCloseListeners = new Map<ChildProcess, (code: number | null) => void>();
  private readonly pendingResults = new Set<Promise<void>>();
  private targets: readonly PreparedTarget[] | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dueAt: Date | undefined;
  private closing = false;
  private finalized = false;
  private started = false;

  constructor(
    private readonly configRoot: string,
    private readonly schedule: Readonly<CollectionSchedule>,
    private readonly referenceStorage: Pick<RecordStorage, 'recordScheduledDuplicate'>,
    private readonly logger: ScheduledCollectionLogger = console,
    private readonly processPath = localRequire.resolve('@oss-scp/collector-cli/dist/process.js'),
    private readonly spawnProcess: SpawnScheduledCollectionProcess = defaultSpawn,
    private readonly now: () => Date = () => new Date(),
    private readonly parentEnvironment: Readonly<NodeJS.ProcessEnv> = process.env,
    private readonly shutdownGraceMs = DEFAULT_SHUTDOWN_GRACE_MS,
    private readonly killWaitMs = DEFAULT_KILL_WAIT_MS,
    private readonly resultDrainMs = DEFAULT_RESULT_DRAIN_MS,
  ) {}

  prepare(definitions: readonly CollectionDefinition[]): void {
    if (this.targets || this.started || this.closing) throw new Error('정기 수집 snapshot은 기동 전에 한 번만 준비할 수 있습니다.');
    if (!this.schedule.enabled) {
      this.targets = [];
      return;
    }
    this.targets = definitions.filter(definition => !isLivePostgresDefinition(definition)).map(definition => {
      scheduledCredentialEnvironment(definition);
      const snapshot = captureScheduledCollectionSnapshot(definition);
      return { definition: snapshot.definition, expectedRevision: definitionRevision(snapshot.definition), snapshot };
    });
  }

  start(definitions?: readonly CollectionDefinition[]): void {
    if (this.started || this.closing || !this.schedule.enabled) return;
    if (definitions) this.prepare(definitions);
    if (!this.targets) throw new Error('정기 수집 snapshot이 준비되지 않았습니다.');
    this.started = true;
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (this.closing) return;
    this.dueAt = nextScheduledInstant(this.now(), this.schedule);
    this.armTimer();
  }

  private armTimer(): void {
    if (this.closing || !this.dueAt) return;
    const delay = Math.max(0, Math.min(this.dueAt.getTime() - this.now().getTime(), MAX_TIMER_DELAY_MS));
    this.timer = setTimeout(() => this.wake(), delay);
    this.timer.unref?.();
  }

  private wake(): void {
    this.timer = undefined;
    if (this.closing || !this.dueAt) return;
    if (this.now().getTime() < this.dueAt.getTime()) { this.armTimer(); return; }
    const scheduledAt = this.dueAt.toISOString();
    this.startTargets(scheduledAt);
    this.scheduleNext();
  }

  private startTargets(scheduledAt: string): void {
    for (const target of this.targets ?? []) {
      const metadata = { configRoot: this.configRoot, expectedRevision: target.expectedRevision, scheduledAt, timezone: this.schedule.timezone };
      let child: ChildProcess;
      try {
        child = this.spawnProcess({
          pluginId: target.definition.plugin.id,
          processPath: this.processPath,
          snapshot: target.snapshot,
          ...metadata,
          environment: scheduledChildEnvironment(this.parentEnvironment, target.definition, metadata),
        });
      } catch {
        this.logger.error(`정기 수집 프로세스를 시작하지 못했습니다: ${target.definition.plugin.id}`);
        continue;
      }
      this.children.add(child);
      let spawnFailed = false;
      let stdoutBytes = 0;
      let stdoutInvalid = child.stdout === null;
      const stdout: Buffer[] = [];
      child.stdout?.on('data', (chunk: Buffer | string) => {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        stdoutBytes += value.byteLength;
        if (stdoutBytes > MAX_PUBLIC_EVENT_BYTES) { stdoutInvalid = true; stdout.length = 0; return; }
        if (!stdoutInvalid) stdout.push(value);
      });
      child.stderr?.resume();
      child.once('error', () => {
        spawnFailed = true;
        this.logger.error(`정기 수집 프로세스를 시작하지 못했습니다: ${target.definition.plugin.id}`);
      });
      const resultOnClose = (code: number | null) => {
        this.closedChildren.add(child);
        this.children.delete(child);
        this.resultCloseListeners.delete(child);
        if (spawnFailed || this.finalized) return;
        const pending = this.handleResult(collectionScope(this.configRoot, target.definition), scheduledAt, code, stdoutInvalid, stdout);
        this.pendingResults.add(pending);
        void pending.finally(() => this.pendingResults.delete(pending));
      };
      this.resultCloseListeners.set(child, resultOnClose);
      child.once('close', resultOnClose);
    }
  }

  private async handleResult(scope: CollectionScope, scheduledAt: string, code: number | null, stdoutInvalid: boolean, chunks: readonly Buffer[]): Promise<void> {
    const { pluginId } = scope;
    let event: PublicEvent;
    try {
      if (stdoutInvalid) throw new Error('invalid stdout');
      event = parsePublicEvent(Buffer.concat(chunks).toString('utf8').trim(), pluginId);
      const expectedCode = event.status === 'success' || event.status === 'duplicate' ? 0 : event.status === 'partial' ? 2 : undefined;
      if (expectedCode !== undefined ? code !== expectedCode : code === 0 || code === 2) throw new Error('event/exit mismatch');
    } catch {
      if (!this.closing) this.logger.error(`정기 수집 결과가 올바르지 않습니다: ${pluginId}`);
      return;
    }
    if (event.status === 'duplicate') {
      if (event.scheduledAt !== scheduledAt || event.scheduleTimezone !== this.schedule.timezone) {
        if (!this.closing) this.logger.error(`정기 수집 결과가 올바르지 않습니다: ${pluginId}`);
        return;
      }
      try {
        await this.referenceStorage.recordScheduledDuplicate({
          ...scope, activeRunId: event.activeRunId!, scheduledAt: event.scheduledAt!,
          scheduleTimezone: event.scheduleTimezone!, observedAt: event.timestamp,
        });
      } catch {
        if (!this.closing) this.logger.error(`정기 수집 중복 참조를 저장하지 못했습니다: ${pluginId}`);
      }
      return;
    }
    if ((event.status === 'failed' || event.status === 'cancelled') && !this.closing) this.logger.error(`정기 수집 실패: ${pluginId}`);
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const children = [...this.children];
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await Promise.all(children.map(async child => {
      if (await waitForClose(child, this.shutdownGraceMs, () => this.closedChildren.has(child))) return;
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await waitForClose(child, this.killWaitMs, () => this.closedChildren.has(child));
    }));
    this.finalized = true;
    for (const [child, listener] of this.resultCloseListeners) child.removeListener('close', listener);
    this.resultCloseListeners.clear();
    this.children.clear();
    await drainResults([...this.pendingResults], this.resultDrainMs);
  }
}
