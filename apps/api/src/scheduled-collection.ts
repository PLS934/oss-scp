import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { isLivePostgresDefinition, type CollectionDefinition, type CollectionSchedule } from '@oss-scp/plugin-config';
import { nextScheduledInstant } from './collection-schedule';
import { definitionRevision } from './plugin-runtime-registry';

const localRequire = createRequire(__filename);
const MAX_TIMER_DELAY_MS = 12 * 60 * 60 * 1000;

export interface ScheduledCollectionLogger { error(message: string): void }
export type SpawnScheduledCollectionProcess = (
  pluginId: string,
  configRoot: string,
  processPath: string,
  expectedRevision: string,
  scheduledAt: string,
  timezone: string,
) => ChildProcess;

const defaultSpawn: SpawnScheduledCollectionProcess = (pluginId, configRoot, processPath, expectedRevision, scheduledAt, timezone) => spawn(
  process.execPath,
  [processPath, pluginId],
  {
    env: {
      ...process.env,
      OSS_SCP_CONFIG_ROOT: configRoot,
      OSS_SCP_COLLECTION_TRIGGER: 'scheduled',
      OSS_SCP_COLLECTION_EXPECTED_REVISION: expectedRevision,
      OSS_SCP_COLLECTION_SCHEDULED_AT: scheduledAt,
      OSS_SCP_COLLECTION_SCHEDULE_TIMEZONE: timezone,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  },
);

export class ScheduledCollectionManager {
  private readonly children = new Set<ChildProcess>();
  private definitions: readonly CollectionDefinition[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dueAt: Date | undefined;
  private closing = false;
  private started = false;

  constructor(
    private readonly configRoot: string,
    private readonly schedule: Readonly<CollectionSchedule>,
    private readonly logger: ScheduledCollectionLogger = console,
    private readonly processPath = localRequire.resolve('@oss-scp/collector-cli/dist/process.js'),
    private readonly spawnProcess: SpawnScheduledCollectionProcess = defaultSpawn,
    private readonly now: () => Date = () => new Date(),
  ) {}

  start(definitions: readonly CollectionDefinition[]): void {
    if (this.started || this.closing || !this.schedule.enabled) return;
    this.started = true;
    this.definitions = definitions.filter(definition => !isLivePostgresDefinition(definition));
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
    for (const definition of this.definitions) {
      let child: ChildProcess;
      try {
        child = this.spawnProcess(
          definition.plugin.id, this.configRoot, this.processPath, definitionRevision(definition), scheduledAt, this.schedule.timezone,
        );
      } catch {
        this.logger.error(`정기 수집 프로세스를 시작하지 못했습니다: ${definition.plugin.id}`);
        continue;
      }
      this.children.add(child);
      let spawnFailed = false;
      child.stderr?.resume();
      child.once('error', () => {
        spawnFailed = true;
        this.logger.error(`정기 수집 프로세스를 시작하지 못했습니다: ${definition.plugin.id}`);
      });
      child.once('close', code => {
        this.children.delete(child);
        if (!spawnFailed && code !== 0 && code !== 2 && !this.closing) this.logger.error(`정기 수집 실패: ${definition.plugin.id}`);
      });
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const children = [...this.children];
    for (const child of children) child.kill('SIGTERM');
    await Promise.all(children.map(child => new Promise<void>(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) resolve();
      else child.once('close', () => resolve());
    })));
  }
}
