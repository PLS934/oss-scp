import { pathToFileURL } from 'node:url';
import { loadTransformSnapshot, type FieldDefinition, type PluginRuntimeDefinition } from '@oss-scp/plugin-config';
import type { Transform, TransformOutput, TransformRecord, TransformRelation } from '@oss-scp/plugin-sdk';

export const TRANSFORM_LIMITS = {
  recordsPerSource: 100,
  relationsPerSource: 200,
  depth: 8,
  arrayItems: 1_000,
  outputBytes: 1024 * 1024,
  batchRecords: 100,
  batchBytes: 1024 * 1024,
} as const;

const moduleCache = new Map<string, Promise<Transform>>();

export class TransformExecutionError extends Error {
  constructor(public readonly code: 'MODULE_LOAD_FAILED' | 'ABORTED' | 'CONSUMER_FAILED') {
    super(code);
    this.name = 'TransformExecutionError';
  }
}

export interface TransformIssue {
  pluginId: string;
  sourceIndex: number;
  code: string;
  path: string;
  message: string;
  keyHint?: string;
}

export interface ValidatedBatch { records: TransformRecord[]; relations: TransformRelation[]; }
export interface ProcessResult { status: 'success' | 'partial'; processed: number; accepted: number; rejected: number; issues: TransformIssue[]; }

export async function loadTransform(transformPath: string): Promise<Transform> {
  let pending = moduleCache.get(transformPath);
  if (!pending) {
    pending = import(pathToFileURL(transformPath).href).then((loaded: Record<string, unknown>) => {
      if (typeof loaded.transform !== 'function') throw new Error('invalid export');
      return loaded.transform as Transform;
    }).catch(() => {
      moduleCache.delete(transformPath);
      throw new TransformExecutionError('MODULE_LOAD_FAILED');
    });
    moduleCache.set(transformPath, pending);
  }
  return pending;
}

export function loadTransformBytes(source: Uint8Array, filename: string): Transform {
  try { return loadTransformSnapshot(source, filename) as Transform; }
  catch { throw new TransformExecutionError('MODULE_LOAD_FAILED'); }
}

export function clearTransformCache(): void { moduleCache.clear(); }

function byteLength(value: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(value)); } catch { return Number.POSITIVE_INFINITY; }
}

function valueError(value: unknown, field: FieldDefinition, path: string, depth: number): { code: string; path: string } | undefined {
  if (depth > TRANSFORM_LIMITS.depth) return { code: 'MAX_DEPTH_EXCEEDED', path };
  if (field.type === 'string') return typeof value === 'string' ? undefined : { code: 'INVALID_FIELD_TYPE', path };
  if (field.type === 'number') return typeof value === 'number' && Number.isFinite(value) ? undefined : { code: 'INVALID_FIELD_TYPE', path };
  if (field.type === 'boolean') return typeof value === 'boolean' ? undefined : { code: 'INVALID_FIELD_TYPE', path };
  if (field.type === 'datetime') return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)) ? undefined : { code: 'INVALID_DATETIME', path };
  if (field.type === 'array') {
    if (!Array.isArray(value)) return { code: 'INVALID_FIELD_TYPE', path };
    if (value.length > TRANSFORM_LIMITS.arrayItems) return { code: 'MAX_ARRAY_ITEMS_EXCEEDED', path };
    for (let index = 0; index < value.length; index += 1) {
      const error = valueError(value[index], field.items, `${path}/${index}`, depth + 1);
      if (error) return error;
    }
    return undefined;
  }
  if (field.type !== 'object') return { code: 'INVALID_FIELD_TYPE', path };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { code: 'INVALID_FIELD_TYPE', path };
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) if (!(key in field.fields)) return { code: 'UNKNOWN_FIELD', path: `${path}/${key}` };
  for (const [key, nested] of Object.entries(field.fields)) {
    if (!(key in object)) { if (nested.required) return { code: 'REQUIRED_FIELD_MISSING', path: `${path}/${key}` }; continue; }
    const error = valueError(object[key], nested, `${path}/${key}`, depth + 1);
    if (error) return error;
  }
  return undefined;
}

function validateRecord(record: TransformRecord, plugin: PluginRuntimeDefinition): { code: string; path: string; key?: string | number } | undefined {
  if (record === null || typeof record !== 'object' || Array.isArray(record) || typeof record.type !== 'string' || record.values === null || typeof record.values !== 'object' || Array.isArray(record.values)) return { code: 'INVALID_OUTPUT', path: '/records' };
  if (Object.keys(record).some((key) => key !== 'type' && key !== 'values')) return { code: 'INVALID_OUTPUT', path: '/records' };
  const definition = plugin.data.types[record.type];
  if (!definition) return { code: 'UNKNOWN_DATA_TYPE', path: '/records/type' };
  for (const key of Object.keys(record.values)) if (!(key in definition.fields)) return { code: 'UNKNOWN_FIELD', path: `/records/values/${key}` };
  for (const [key, field] of Object.entries(definition.fields)) {
    if (!(key in record.values)) { if (field.required) return { code: 'REQUIRED_FIELD_MISSING', path: `/records/values/${key}` }; continue; }
    const error = valueError(record.values[key], field, `/records/values/${key}`, 1);
    if (error) return error;
  }
  const key = record.values[definition.uniqueKey];
  if ((typeof key !== 'string' && typeof key !== 'number') || key === '' || (typeof key === 'number' && !Number.isFinite(key))) return { code: 'INVALID_UNIQUE_KEY', path: `/records/values/${definition.uniqueKey}` };
  return { code: '', path: '', key };
}

function normalizedOutput(output: unknown): TransformOutput | undefined {
  if (output === null || typeof output !== 'object' || Array.isArray(output)) return undefined;
  const candidate = output as Partial<TransformOutput>;
  if (Object.keys(candidate).some((key) => key !== 'records' && key !== 'relations')) return undefined;
  if (!Array.isArray(candidate.records) || (candidate.relations !== undefined && !Array.isArray(candidate.relations))) return undefined;
  return { records: candidate.records, relations: candidate.relations ?? [] };
}

function validateOutput(outputValue: unknown, plugin: PluginRuntimeDefinition, seen: Set<string>): { output?: TransformOutput; error?: { code: string; path: string; keyHint?: string }; keys?: string[] } {
  const output = normalizedOutput(outputValue);
  if (!output) return { error: { code: 'INVALID_OUTPUT', path: '/' } };
  if (byteLength(output) > TRANSFORM_LIMITS.outputBytes) return { error: { code: 'MAX_OUTPUT_BYTES_EXCEEDED', path: '/' } };
  if (output.records.length > TRANSFORM_LIMITS.recordsPerSource) return { error: { code: 'MAX_RECORDS_EXCEEDED', path: '/records' } };
  const relations = output.relations ?? [];
  if (relations.length > TRANSFORM_LIMITS.relationsPerSource) return { error: { code: 'MAX_RELATIONS_EXCEEDED', path: '/relations' } };
  const localKeys = new Set<string>();
  const keys: string[] = [];
  for (let index = 0; index < output.records.length; index += 1) {
    const result = validateRecord(output.records[index], plugin);
    if (!result || result.code) return { error: { code: result?.code ?? 'INVALID_OUTPUT', path: result?.path ?? `/records/${index}` } };
    const scoped = `${output.records[index].type}:${String(result.key)}`;
    if (seen.has(scoped) || localKeys.has(scoped)) return { error: { code: 'DUPLICATE_UNIQUE_KEY', path: `/records/${index}`, keyHint: String(result.key).slice(0, 100) } };
    localKeys.add(scoped); keys.push(scoped);
  }
  const available = new Set([...seen, ...localKeys]);
  for (let index = 0; index < relations.length; index += 1) {
    const relation = relations[index];
    if (!relation || typeof relation !== 'object' || Array.isArray(relation) || Object.keys(relation).some((key) => key !== 'type' && key !== 'from' && key !== 'to')) return { error: { code: 'INVALID_RELATION', path: `/relations/${index}` } };
    const definition = plugin.data.relations?.[relation?.type];
    if (!definition) return { error: { code: 'INVALID_RELATION', path: `/relations/${index}/type` } };
    for (const [end, allowed] of [['from', definition.from.types], ['to', definition.to.types]] as const) {
      const reference = relation[end];
      if (!reference || typeof reference !== 'object' || (typeof reference.key !== 'string' && typeof reference.key !== 'number') || reference.key === '' || !allowed.includes(reference.type) || !available.has(`${reference.type}:${String(reference.key)}`)) return { error: { code: 'INVALID_RELATION', path: `/relations/${index}/${end}` } };
    }
  }
  return { output, keys };
}

function abortIfNeeded(signal: AbortSignal): void { if (signal.aborted) throw new TransformExecutionError('ABORTED'); }

export async function processRecords(options: {
  plugin: PluginRuntimeDefinition;
  sourceId: string;
  collectedAt: string;
  records: Iterable<unknown> | AsyncIterable<unknown>;
  responseMetadata?: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
  consume: (batch: ValidatedBatch) => Promise<void>;
  transform?: Transform;
}): Promise<ProcessResult> {
  const signal = options.signal ?? new AbortController().signal;
  abortIfNeeded(signal);
  const transform = options.transform ?? await loadTransform(options.plugin.transformPath);
  const seen = new Set<string>();
  const issues: TransformIssue[] = [];
  let records: TransformRecord[] = [];
  let relations: TransformRelation[] = [];
  let bytes = 0, processed = 0, accepted = 0;
  const flush = async (): Promise<void> => {
    if (records.length === 0 && relations.length === 0) return;
    const batch = { records, relations }; records = []; relations = []; bytes = 0;
    try { await options.consume(batch); } catch { throw new TransformExecutionError('CONSUMER_FAILED'); }
  };
  for await (const record of options.records) {
    abortIfNeeded(signal);
    const sourceIndex = processed++;
    let raw: unknown;
    try { raw = await transform({ record, context: Object.freeze({ pluginId: options.plugin.id, sourceId: options.sourceId, collectedAt: options.collectedAt, responseMetadata: options.responseMetadata ? Object.freeze({ ...options.responseMetadata }) : undefined, signal }) }); }
    catch { issues.push({ pluginId: options.plugin.id, sourceIndex, code: 'TRANSFORM_FAILED', path: '/', message: 'transform failed' }); continue; }
    abortIfNeeded(signal);
    const validation = validateOutput(raw, options.plugin, seen);
    if (!validation.output || validation.error) {
      issues.push({ pluginId: options.plugin.id, sourceIndex, code: validation.error?.code ?? 'INVALID_OUTPUT', path: validation.error?.path ?? '/', message: 'transform output rejected', ...(validation.error?.keyHint ? { keyHint: validation.error.keyHint } : {}) });
      continue;
    }
    const outputBytes = byteLength(validation.output);
    if (records.length > 0 && (records.length + validation.output.records.length > TRANSFORM_LIMITS.batchRecords || bytes + outputBytes > TRANSFORM_LIMITS.batchBytes)) await flush();
    validation.keys?.forEach((key) => seen.add(key));
    records.push(...validation.output.records); relations.push(...(validation.output.relations ?? [])); bytes += outputBytes; accepted += 1;
    if (records.length >= TRANSFORM_LIMITS.batchRecords || bytes >= TRANSFORM_LIMITS.batchBytes) await flush();
  }
  await flush();
  return { status: issues.length ? 'partial' : 'success', processed, accepted, rejected: issues.length, issues };
}

export type { Transform, TransformOutput, TransformRecord, TransformRelation } from '@oss-scp/plugin-sdk';
export {
  CollectionRunnerError,
  runCollection,
  type CollectionCollector,
  type CollectionRunResult,
  type CollectionRunnerErrorCode,
  type CollectorBatch,
  type CollectorBatchHandler,
  type CollectorContext,
  type RunCollectionOptions,
} from './runner.js';
