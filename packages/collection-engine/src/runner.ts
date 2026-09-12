import { isDeepStrictEqual } from 'node:util';
import type { PluginRuntimeDefinition } from '@oss-scp/plugin-config';
import type { Transform } from '@oss-scp/plugin-sdk';
import type { CollectionScope, JsonValue, RecordStorage, StorageRecord } from '@oss-scp/platform-db';
import { loadTransform, processRecords, TransformExecutionError, type ValidatedBatch } from './index.js';

export interface CollectorBatch {
  records: Iterable<unknown> | AsyncIterable<unknown>;
  startCheckpoint: JsonValue | null;
  nextCheckpoint: Exclude<JsonValue, null>;
  collectedAt: string;
  responseMetadata?: Readonly<Record<string, unknown>>;
}

export interface CollectorContext { checkpoint: JsonValue | null; signal: AbortSignal }
export type CollectorBatchHandler = (batch: CollectorBatch) => Promise<void>;
export type CollectionCollector = (context: CollectorContext, onBatch: CollectorBatchHandler) => Promise<void>;

export type CollectionRunnerErrorCode = 'module_load' | 'collection' | 'transform_consumer' | 'storage' | 'cancelled';

const runnerErrorMessages: Record<CollectionRunnerErrorCode, string> = {
  module_load: '플러그인 가공 모듈을 불러올 수 없습니다.',
  collection: '원천 데이터 수집에 실패했습니다.',
  transform_consumer: '가공 결과 처리에 실패했습니다.',
  storage: '수집 결과 저장에 실패했습니다.',
  cancelled: '수집 실행이 취소되었습니다.',
};

/** 하위 오류, 원천 데이터 또는 비밀정보를 노출하지 않는 공개 실행 오류. */
export class CollectionRunnerError extends Error {
  constructor(readonly code: CollectionRunnerErrorCode) {
    super(runnerErrorMessages[code]);
    this.name = 'CollectionRunnerError';
  }
}

export interface CollectionRunResult {
  runId: string;
  status: 'success' | 'partial';
  batches: number;
  processed: number;
  accepted: number;
  rejected: number;
  checkpoint: JsonValue | null;
}

export interface RunCollectionOptions {
  plugin: PluginRuntimeDefinition;
  scope: CollectionScope;
  collector: CollectionCollector;
  storage: RecordStorage;
  signal?: AbortSignal;
  transform?: Transform;
  now?: () => string;
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new CollectionRunnerError('cancelled');
}

function storageRecords(batch: ValidatedBatch, plugin: PluginRuntimeDefinition): StorageRecord[] {
  return batch.records.map((record) => {
    const definition = plugin.data.types[record.type];
    const key = definition && record.values[definition.uniqueKey];
    if (typeof key !== 'string' && typeof key !== 'number') {
      throw new CollectionRunnerError('transform_consumer');
    }
    return { type: record.type, key, values: record.values };
  });
}

function normalizeError(error: unknown, signal: AbortSignal): CollectionRunnerError {
  if (error instanceof CollectionRunnerError) return error;
  if (signal.aborted) return new CollectionRunnerError('cancelled');
  if (error instanceof TransformExecutionError) {
    if (error.code === 'ABORTED') return new CollectionRunnerError('cancelled');
    if (error.code === 'MODULE_LOAD_FAILED') return new CollectionRunnerError('module_load');
    return new CollectionRunnerError('transform_consumer');
  }
  return new CollectionRunnerError('collection');
}

export async function runCollection(options: RunCollectionOptions): Promise<CollectionRunResult> {
  const signal = options.signal ?? new AbortController().signal;
  const now = options.now ?? (() => new Date().toISOString());
  abortIfNeeded(signal);

  let checkpoint: JsonValue | null;
  try {
    checkpoint = await options.storage.getCheckpoint(options.scope);
  } catch {
    throw new CollectionRunnerError('storage');
  }
  abortIfNeeded(signal);

  let transform: Transform;
  try {
    transform = options.transform ?? await loadTransform(options.plugin.transformPath);
  } catch (error) {
    throw normalizeError(error, signal);
  }
  abortIfNeeded(signal);

  let runId: string;
  try {
    runId = await options.storage.startRun({ ...options.scope, startedAt: now(), exclusive: true });
  } catch {
    throw new CollectionRunnerError('storage');
  }

  let batches = 0;
  let processed = 0;
  let accepted = 0;
  let rejected = 0;
  const heartbeat = options.storage.renewRun
    ? setInterval(() => { void options.storage.renewRun!(runId).catch(() => undefined); }, 30_000)
    : undefined;
  heartbeat?.unref();

  try {
    await options.collector({ checkpoint, signal }, async (sourceBatch) => {
      abortIfNeeded(signal);
      if (!isDeepStrictEqual(sourceBatch.startCheckpoint, checkpoint)) {
        throw new CollectionRunnerError('collection');
      }
      const records: StorageRecord[] = [];
      const relations: ValidatedBatch['relations'] = [];
      const result = await processRecords({
        plugin: options.plugin,
        sourceId: options.scope.sourceId,
        collectedAt: sourceBatch.collectedAt,
        records: sourceBatch.records,
        responseMetadata: sourceBatch.responseMetadata,
        signal,
        transform,
        consume: async (batch) => {
          records.push(...storageRecords(batch, options.plugin));
          relations.push(...batch.relations);
        },
      });

      abortIfNeeded(signal);
      try {
        await options.storage.commitBatch({
          runId,
          scope: options.scope,
          observedAt: sourceBatch.collectedAt,
          expectedCheckpoint: checkpoint,
          nextCheckpoint: sourceBatch.nextCheckpoint,
          processedCount: result.processed,
          acceptedCount: result.accepted,
          records,
          relations,
          issues: result.issues.map(({ sourceIndex, code, path, message, keyHint }) => ({
            sourceIndex, code, path, message, ...(keyHint === undefined ? {} : { keyHint }),
          })),
        });
      } catch {
        throw new CollectionRunnerError('storage');
      }

      checkpoint = sourceBatch.nextCheckpoint;
      batches += 1;
      processed += result.processed;
      accepted += result.accepted;
      rejected += result.rejected;
      abortIfNeeded(signal);
    });
    abortIfNeeded(signal);
  } catch (error) {
    const normalized = normalizeError(error, signal);
    try {
      await options.storage.finishRun({ runId, status: 'failed', finishedAt: now() });
    } catch {
      // Preserve the original stable failure instead of exposing a secondary storage error.
    }
    throw normalized;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }

  const status = rejected > 0 ? 'partial' : 'success';
  try {
    await options.storage.finishRun({ runId, status, finishedAt: now() });
  } catch {
    throw new CollectionRunnerError('storage');
  }
  return { runId, status, batches, processed, accepted, rejected, checkpoint };
}
