import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { runCollection, CollectionRunnerError, loadTransformBytes, type CollectionCollector, type CollectionRunResult, type RunCollectionOptions } from '@oss-scp/collection-engine';
import { collectHttpOffset, collectHttpSingle } from '@oss-scp/http-collector';
import { collectHttpCsv } from '@oss-scp/http-csv-source';
import { collectLocalCsv } from '@oss-scp/local-csv-source';
import {
  createPlatformRecordAdapters,
  mysqlAdapter,
  postgresAdapter,
  readPlatformDbConfig,
  selectPlatformDbAdapter,
  type CollectionScope,
  type RecordStorage,
} from '@oss-scp/platform-db';
import { isLivePostgresDefinition, MAX_TRANSFORM_BYTES, preflightConfiguration, transformDigest, type CollectionDefinition, type ConfigurationResult, type HttpCsvCollectionDefinition, type OffsetCollectionDefinition, type SingleCollectionDefinition } from '@oss-scp/plugin-config';

export type CliErrorCode =
  | 'usage'
  | 'repository_config'
  | 'plugin_not_found'
  | 'unsupported_collector'
  | 'platform_db_config'
  | 'unsupported_db_storage'
  | 'platform_db_connection'
  | 'collection_failed'
  | 'cancelled';

export class ManualCollectionError extends Error {
  constructor(readonly code: CliErrorCode, readonly phase: 'config' | 'runtime' | 'cancelled') {
    super(code);
    this.name = 'ManualCollectionError';
  }
}

export interface CliSuccess {
  exitCode: 0 | 2;
  status: 'success' | 'partial';
  pluginId: string;
  result: CollectionRunResult;
}

export interface CliFailure {
  exitCode: 1 | 3 | 130;
  status: 'failed' | 'cancelled';
  pluginId?: string;
  errorCode: CliErrorCode;
}

export interface CliDuplicate {
  exitCode: 0;
  status: 'duplicate';
  pluginId: string;
  activeRunId: string;
  scheduledAt: string;
  scheduleTimezone: string;
}

export type CliOutcome = CliSuccess | CliFailure | CliDuplicate;

export interface Closeable { close(): Promise<void> }
export type Runner = (options: RunCollectionOptions) => Promise<CollectionRunResult>;

export interface ManualCollectionDependencies {
  validate(root: string): ConfigurationResult | Promise<ConfigurationResult>;
  connectStorage(env: Readonly<Record<string, string | undefined>>): Promise<{ storage: RecordStorage; resource: Closeable }>;
  run: Runner;
  now(): string;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'transformPath')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

export function configRevision(definition: CollectionDefinition): string {
  return createHash('sha256').update(JSON.stringify(stable(definition))).digest('hex');
}

export interface SerializedScheduledCollectionSnapshot {
  definition: CollectionDefinition;
  transform: { digest: string; sourceBase64: string };
}

export interface VerifiedScheduledCollectionSnapshot {
  definition: CollectionDefinition;
  transform: RunCollectionOptions['transform'];
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

export function verifyScheduledCollectionSnapshot(
  value: unknown,
  pluginId: string,
  expectedRevision: string,
): VerifiedScheduledCollectionSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !exactKeys(value as Record<string, unknown>, ['definition', 'transform'])) {
    throw new ManualCollectionError('repository_config', 'config');
  }
  const { definition, transform } = value as { definition?: unknown; transform?: unknown };
  if (definition === null || typeof definition !== 'object' || Array.isArray(definition)
    || transform === null || typeof transform !== 'object' || Array.isArray(transform)
    || !exactKeys(transform as Record<string, unknown>, ['digest', 'sourceBase64'])) {
    throw new ManualCollectionError('repository_config', 'config');
  }
  const candidate = definition as CollectionDefinition;
  const plugin = (candidate as { plugin?: unknown }).plugin;
  const snapshot = transform as { digest?: unknown; sourceBase64?: unknown };
  if (plugin === null || typeof plugin !== 'object' || Array.isArray(plugin)
    || (plugin as { id?: unknown }).id !== pluginId
    || typeof (plugin as { transformPath?: unknown }).transformPath !== 'string'
    || typeof (plugin as { transformDigest?: unknown }).transformDigest !== 'string'
    || typeof snapshot.digest !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.digest)
    || snapshot.digest !== (plugin as { transformDigest: string }).transformDigest
    || typeof snapshot.sourceBase64 !== 'string') {
    throw new ManualCollectionError('repository_config', 'config');
  }
  const source = Buffer.from(snapshot.sourceBase64, 'base64');
  if (source.byteLength === 0 || source.byteLength > MAX_TRANSFORM_BYTES || source.toString('base64') !== snapshot.sourceBase64
    || transformDigest(source) !== snapshot.digest || configRevision(candidate) !== expectedRevision) {
    throw new ManualCollectionError('repository_config', 'config');
  }
  const loaded = loadTransformBytes(source, (plugin as { transformPath: string }).transformPath);
  return { definition: candidate, transform: loaded };
}

export async function readScheduledCollectionSnapshot(
  input: AsyncIterable<Uint8Array | string>,
  pluginId: string,
  expectedRevision: string,
): Promise<VerifiedScheduledCollectionSnapshot> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of input) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += value.byteLength;
    if (bytes > MAX_TRANSFORM_BYTES * 2) throw new ManualCollectionError('repository_config', 'config');
    chunks.push(value);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ManualCollectionError('repository_config', 'config'); }
  return verifyScheduledCollectionSnapshot(parsed, pluginId, expectedRevision);
}

export function parsePluginId(args: readonly string[]): string {
  const normalized = args[0] === '--' ? args.slice(1) : args;
  if (normalized.length !== 1 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(normalized[0] ?? '')) {
    throw new ManualCollectionError('usage', 'config');
  }
  return normalized[0]!;
}

export function configRoot(env: Readonly<Record<string, string | undefined>>): string {
  const value = env.OSS_SCP_CONFIG_ROOT;
  if (!value || !value.trim()) throw new ManualCollectionError('repository_config', 'config');
  return resolve(value);
}

export function selectDefinition(result: ConfigurationResult, pluginId: string): CollectionDefinition {
  if (!result.ok) throw new ManualCollectionError('repository_config', 'config');
  const selected = result.definitions.filter((definition) => definition.plugin.id === pluginId);
  if (selected.length !== 1) throw new ManualCollectionError('plugin_not_found', 'config');
  return selected[0]!;
}

function sourceId(root: string, definition: CollectionDefinition): string {
  return 'connection' in definition
    ? definition.connection.id
    : `file:${relative(root, definition.source.path).replaceAll('\\', '/')}`;
}

export function collectionScope(root: string, definition: CollectionDefinition): CollectionScope {
  return {
    pluginId: definition.plugin.id,
    sourceId: sourceId(root, definition),
    scopeType: 'full',
    scopeKey: '',
    configRevision: configRevision(definition),
  };
}

function numericCheckpoint(value: unknown, fallback: number): number {
  if (value === null) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ManualCollectionError('collection_failed', 'runtime');
  return value as number;
}

export function collectorFor(definition: CollectionDefinition, now: () => string): CollectionCollector {
  if (isLivePostgresDefinition(definition)) throw new ManualCollectionError('unsupported_collector', 'config');
  if ('pagination' in definition && definition.pagination.type === 'offset') {
    const offsetDefinition = definition as OffsetCollectionDefinition;
    return async ({ checkpoint, signal }, onBatch) => {
      const start = numericCheckpoint(checkpoint, offsetDefinition.pagination.start);
      let expectedCheckpoint = checkpoint;
      await collectHttpOffset({ ...offsetDefinition, pagination: { ...offsetDefinition.pagination, start } }, async (batch) => {
        const nextCheckpoint = batch.offset + batch.items.length;
        await onBatch({ records: batch.items, startCheckpoint: expectedCheckpoint, nextCheckpoint, collectedAt: now(), responseMetadata: { total: batch.total } });
        expectedCheckpoint = nextCheckpoint;
      }, { signal });
    };
  }
  if ('pagination' in definition && definition.pagination.type === 'single') {
    const singleDefinition = definition as SingleCollectionDefinition;
    return async ({ checkpoint, signal }, onBatch) => {
      if (checkpoint !== null) return;
      await collectHttpSingle(singleDefinition, async (batch) => {
        await onBatch({ records: batch.items, startCheckpoint: null, nextCheckpoint: { complete: true }, collectedAt: now(), responseMetadata: batch.responseMetadata });
      }, { signal });
    };
  }
  if ('request' in definition && definition.request.format === 'csv') {
    const httpCsvDefinition = definition as HttpCsvCollectionDefinition;
    return async ({ checkpoint, signal }, onBatch) => {
      let consumed = numericCheckpoint(checkpoint, 0);
      let expectedCheckpoint = checkpoint;
      let position = 0;
      await collectHttpCsv(httpCsvDefinition, async (batch) => {
        const end = position + batch.records.length;
        if (end <= consumed) { position = end; return; }
        const records = batch.records.slice(Math.max(0, consumed - position));
        const nextCheckpoint = consumed + records.length;
        await onBatch({ records, startCheckpoint: expectedCheckpoint, nextCheckpoint, collectedAt: now(), responseMetadata: { complete: batch.complete } });
        expectedCheckpoint = nextCheckpoint;
        consumed = nextCheckpoint;
        position = end;
      }, { signal });
    };
  }
  if ('source' in definition && 'transport' in definition.source && definition.source.transport === 'file') {
    return async ({ checkpoint, signal }, onBatch) => {
      let consumed = numericCheckpoint(checkpoint, 0);
      let expectedCheckpoint = checkpoint;
      let position = 0;
      for await (const batch of collectLocalCsv(definition, { signal })) {
        const end = position + batch.records.length;
        if (end <= consumed) { position = end; continue; }
        const records = batch.records.slice(Math.max(0, consumed - position));
        const nextCheckpoint = consumed + records.length;
        await onBatch({ records, startCheckpoint: expectedCheckpoint, nextCheckpoint, collectedAt: now(), responseMetadata: { complete: batch.complete } });
        expectedCheckpoint = nextCheckpoint;
        consumed += records.length;
        position = end;
      }
    };
  }
  throw new ManualCollectionError('unsupported_collector', 'config');
}

export function idempotentClose(resource: Closeable): Closeable {
  let closing: Promise<void> | undefined;
  return { close: () => closing ??= resource.close().catch(() => undefined) };
}

export async function connectPlatformStorage(env: Readonly<Record<string, string | undefined>>): Promise<{ storage: RecordStorage; resource: Closeable }> {
  const adapters = [postgresAdapter, mysqlAdapter] as const;
  let config;
  try { config = readPlatformDbConfig(env, adapters); }
  catch { throw new ManualCollectionError('platform_db_config', 'config'); }
  let connection;
  try { connection = await selectPlatformDbAdapter(config.type, adapters).connect(config); }
  catch { throw new ManualCollectionError('platform_db_connection', 'runtime'); }
  return { storage: createPlatformRecordAdapters(config.type, connection).storage, resource: idempotentClose(connection) };
}

/** @deprecated connectPlatformStorage를 사용한다. */
export const connectPostgresStorage = connectPlatformStorage;

export const defaultDependencies: ManualCollectionDependencies = {
  validate: preflightConfiguration,
  connectStorage: connectPlatformStorage,
  run: runCollection,
  now: () => new Date().toISOString(),
};

export async function executeManualCollection(options: {
  args: readonly string[];
  root: string;
  env: Readonly<Record<string, string | undefined>>;
  signal: AbortSignal;
  trigger?: 'startup' | 'scheduled' | 'cli' | 'api';
  requestId?: string;
  scheduledAt?: string;
  scheduleTimezone?: string;
  expectedConfigRevision?: string;
  scheduledSnapshot?: VerifiedScheduledCollectionSnapshot;
  dependencies?: ManualCollectionDependencies;
}): Promise<CliOutcome> {
  const dependencies = options.dependencies ?? defaultDependencies;
  let pluginId: string | undefined;
  let resource: Closeable | undefined;
  try {
    pluginId = parsePluginId(options.args);
    const definition = options.scheduledSnapshot?.definition ?? selectDefinition(await dependencies.validate(options.root), pluginId);
    if (definition.plugin.id !== pluginId || (options.expectedConfigRevision !== undefined && configRevision(definition) !== options.expectedConfigRevision)) {
      throw new ManualCollectionError('repository_config', 'config');
    }
    const collector = collectorFor(definition, dependencies.now);
    const connected = await dependencies.connectStorage(options.env);
    resource = idempotentClose(connected.resource);
    const result = await dependencies.run({
      plugin: definition.plugin,
      scope: collectionScope(options.root, definition),
      collector,
      storage: connected.storage,
      signal: options.signal,
      now: dependencies.now,
      trigger: options.trigger ?? 'cli',
      ...(options.requestId ? { requestId: options.requestId } : {}),
      ...(options.scheduledAt ? { scheduledAt: options.scheduledAt } : {}),
      ...(options.scheduleTimezone ? { scheduleTimezone: options.scheduleTimezone } : {}),
      ...(options.scheduledSnapshot?.transform ? { transform: options.scheduledSnapshot.transform } : {}),
    });
    return { exitCode: result.status === 'success' ? 0 : 2, status: result.status, pluginId, result };
  } catch (error) {
    if (error instanceof CollectionRunnerError && error.code === 'already_running' && error.activeRunId
      && options.trigger === 'scheduled' && options.scheduledAt && options.scheduleTimezone) {
      return {
        exitCode: 0, status: 'duplicate', pluginId: pluginId!, activeRunId: error.activeRunId,
        scheduledAt: options.scheduledAt, scheduleTimezone: options.scheduleTimezone,
      };
    }
    const normalized = error instanceof ManualCollectionError ? error
      : error instanceof CollectionRunnerError && error.code === 'cancelled' ? new ManualCollectionError('cancelled', 'cancelled')
      : options.signal.aborted ? new ManualCollectionError('cancelled', 'cancelled')
      : new ManualCollectionError('collection_failed', 'runtime');
    return {
      exitCode: normalized.phase === 'config' ? 1 : normalized.phase === 'cancelled' ? 130 : 3,
      status: normalized.phase === 'cancelled' ? 'cancelled' : 'failed',
      ...(pluginId ? { pluginId } : {}),
      errorCode: normalized.code,
    };
  } finally {
    await resource?.close();
  }
}

export function collectionProcessInvocation(env: Readonly<Record<string, string | undefined>>): {
  trigger: 'startup' | 'scheduled' | 'cli';
  scheduledAt?: string;
  scheduleTimezone?: string;
  expectedConfigRevision?: string;
} {
  const rawTrigger = env.OSS_SCP_COLLECTION_TRIGGER ?? 'cli';
  if (!['startup', 'scheduled', 'cli'].includes(rawTrigger)) throw new ManualCollectionError('repository_config', 'config');
  const scheduledAt = env.OSS_SCP_COLLECTION_SCHEDULED_AT;
  const scheduleTimezone = env.OSS_SCP_COLLECTION_SCHEDULE_TIMEZONE;
  const expectedConfigRevision = env.OSS_SCP_COLLECTION_EXPECTED_REVISION;
  if (rawTrigger !== 'scheduled') {
    if (scheduledAt !== undefined || scheduleTimezone !== undefined || expectedConfigRevision !== undefined) throw new ManualCollectionError('repository_config', 'config');
    return { trigger: rawTrigger as 'startup' | 'cli' };
  }
  if (!scheduledAt || !scheduleTimezone || !expectedConfigRevision || !/^[a-f0-9]{64}$/.test(expectedConfigRevision)) throw new ManualCollectionError('repository_config', 'config');
  try {
    if (new Date(scheduledAt).toISOString() !== scheduledAt) throw new Error('invalid instant');
    new Intl.DateTimeFormat('en-US', { timeZone: scheduleTimezone }).format(0);
  } catch {
    throw new ManualCollectionError('repository_config', 'config');
  }
  return { trigger: 'scheduled', scheduledAt, scheduleTimezone, expectedConfigRevision };
}

export interface PublicEvent {
  version: 1;
  timestamp: string;
  event: 'collection_finished';
  pluginId?: string;
  status: 'success' | 'partial' | 'duplicate' | 'failed' | 'cancelled';
  runId?: string;
  batches?: number;
  processed?: number;
  accepted?: number;
  rejected?: number;
  errorCode?: CliErrorCode;
  activeRunId?: string;
  scheduledAt?: string;
  scheduleTimezone?: string;
}

export const MAX_PUBLIC_EVENT_BYTES = 16 * 1024;

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}

function runIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function count(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }

/** scheduled parent가 신뢰할 수 있는 단일 collector event만 엄격하게 해석한다. */
export function parsePublicEvent(serialized: string, expectedPluginId: string): PublicEvent {
  if (Buffer.byteLength(serialized) === 0 || Buffer.byteLength(serialized) > MAX_PUBLIC_EVENT_BYTES) throw new Error('invalid public event');
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); } catch { throw new Error('invalid public event'); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid public event');
  const event = parsed as Record<string, unknown>;
  if (event.version !== 1 || event.event !== 'collection_finished' || event.pluginId !== expectedPluginId
    || !identifier(event.pluginId) || !canonicalTimestamp(event.timestamp)) throw new Error('invalid public event');
  const common = ['event', 'pluginId', 'status', 'timestamp', 'version'];
  if (event.status === 'success' || event.status === 'partial') {
    if (!exactKeys(event, [...common, 'accepted', 'batches', 'processed', 'rejected', 'runId']) || !runIdentifier(event.runId)
      || !count(event.batches) || !count(event.processed) || !count(event.accepted) || !count(event.rejected)
      || (event.accepted as number) + (event.rejected as number) !== event.processed) throw new Error('invalid public event');
  } else if (event.status === 'duplicate') {
    if (!exactKeys(event, [...common, 'activeRunId', 'scheduledAt', 'scheduleTimezone']) || !runIdentifier(event.activeRunId)
      || !canonicalTimestamp(event.scheduledAt) || typeof event.scheduleTimezone !== 'string') throw new Error('invalid public event');
    try { new Intl.DateTimeFormat('en-US', { timeZone: event.scheduleTimezone }).format(0); } catch { throw new Error('invalid public event'); }
  } else if (event.status === 'failed' || event.status === 'cancelled') {
    if (!exactKeys(event, [...common, 'errorCode']) || typeof event.errorCode !== 'string'
      || !(new Set<CliErrorCode>(['usage', 'repository_config', 'plugin_not_found', 'unsupported_collector', 'platform_db_config', 'unsupported_db_storage', 'platform_db_connection', 'collection_failed', 'cancelled'])).has(event.errorCode as CliErrorCode)) throw new Error('invalid public event');
  } else throw new Error('invalid public event');
  return event as unknown as PublicEvent;
}

export function publicEvent(outcome: CliOutcome, timestamp: string): PublicEvent {
  const base = { version: 1 as const, timestamp, event: 'collection_finished' as const, ...(outcome.pluginId ? { pluginId: outcome.pluginId } : {}), status: outcome.status };
  if ('result' in outcome) return { ...base, runId: outcome.result.runId, batches: outcome.result.batches, processed: outcome.result.processed, accepted: outcome.result.accepted, rejected: outcome.result.rejected };
  if (outcome.status === 'duplicate') return { ...base, activeRunId: outcome.activeRunId, scheduledAt: outcome.scheduledAt, scheduleTimezone: outcome.scheduleTimezone };
  return { ...base, errorCode: outcome.errorCode };
}
