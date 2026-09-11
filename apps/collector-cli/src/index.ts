import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { runCollection, CollectionRunnerError, type CollectionCollector, type CollectionRunResult, type RunCollectionOptions } from '@oss-scp/collection-engine';
import { collectHttpOffset, collectHttpSingle } from '@oss-scp/http-collector';
import { collectLocalCsv } from '@oss-scp/local-csv-source';
import {
  createPostgresRecordStorage,
  postgresAdapter,
  readPlatformDbConfig,
  type CollectionScope,
  type PostgresPlatformDbConnection,
  type RecordStorage,
} from '@oss-scp/platform-db';
import { validateRepository, type CollectionDefinition, type ConfigurationResult, type OffsetCollectionDefinition, type SingleCollectionDefinition } from '@oss-scp/plugin-config';

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

export type CliOutcome = CliSuccess | CliFailure;

export interface Closeable { close(): Promise<void> }
export type Runner = (options: RunCollectionOptions) => Promise<CollectionRunResult>;

export interface ManualCollectionDependencies {
  validate(root: string): ConfigurationResult;
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

export function parsePluginId(args: readonly string[]): string {
  const normalized = args[0] === '--' ? args.slice(1) : args;
  if (normalized.length !== 1 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(normalized[0] ?? '')) {
    throw new ManualCollectionError('usage', 'config');
  }
  return normalized[0]!;
}

export function findRepositoryRoot(start: string): string {
  let current = start;
  while (true) {
    if (existsSync(join(current, 'plugins', 'registry.json')) && existsSync(join(current, 'connections', 'registry.json'))) return current;
    const parent = dirname(current);
    if (parent === current) throw new ManualCollectionError('repository_config', 'config');
    current = parent;
  }
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
  if ('source' in definition && definition.source.transport === 'file') {
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

export async function connectPostgresStorage(env: Readonly<Record<string, string | undefined>>): Promise<{ storage: RecordStorage; resource: Closeable }> {
  let config;
  try { config = readPlatformDbConfig(env, [postgresAdapter]); }
  catch { throw new ManualCollectionError(env.PLATFORM_DB_TYPE === 'mysql' ? 'unsupported_db_storage' : 'platform_db_config', 'config'); }
  let connection: PostgresPlatformDbConnection;
  try { connection = await postgresAdapter.connect(config) as PostgresPlatformDbConnection; }
  catch { throw new ManualCollectionError('platform_db_connection', 'runtime'); }
  return { storage: createPostgresRecordStorage(connection), resource: idempotentClose(connection) };
}

export const defaultDependencies: ManualCollectionDependencies = {
  validate: validateRepository,
  connectStorage: connectPostgresStorage,
  run: runCollection,
  now: () => new Date().toISOString(),
};

export async function executeManualCollection(options: {
  args: readonly string[];
  root: string;
  env: Readonly<Record<string, string | undefined>>;
  signal: AbortSignal;
  dependencies?: ManualCollectionDependencies;
}): Promise<CliOutcome> {
  const dependencies = options.dependencies ?? defaultDependencies;
  let pluginId: string | undefined;
  let resource: Closeable | undefined;
  try {
    pluginId = parsePluginId(options.args);
    const definition = selectDefinition(dependencies.validate(options.root), pluginId);
    const collector = collectorFor(definition, dependencies.now);
    const connected = await dependencies.connectStorage(options.env);
    resource = idempotentClose(connected.resource);
    const result = await dependencies.run({ plugin: definition.plugin, scope: collectionScope(options.root, definition), collector, storage: connected.storage, signal: options.signal, now: dependencies.now });
    return { exitCode: result.status === 'success' ? 0 : 2, status: result.status, pluginId, result };
  } catch (error) {
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

export interface PublicEvent {
  version: 1;
  timestamp: string;
  event: 'collection_finished';
  pluginId?: string;
  status: 'success' | 'partial' | 'failed' | 'cancelled';
  runId?: string;
  batches?: number;
  processed?: number;
  accepted?: number;
  rejected?: number;
  errorCode?: CliErrorCode;
}

export function publicEvent(outcome: CliOutcome, timestamp: string): PublicEvent {
  const base = { version: 1 as const, timestamp, event: 'collection_finished' as const, ...(outcome.pluginId ? { pluginId: outcome.pluginId } : {}), status: outcome.status };
  if ('result' in outcome) return { ...base, runId: outcome.result.runId, batches: outcome.result.batches, processed: outcome.result.processed, accepted: outcome.result.accepted, rejected: outcome.result.rejected };
  return { ...base, errorCode: outcome.errorCode };
}
