export const STORAGE_LIMITS = {
  identifierCharacters: 255,
  externalKeyCharacters: 2_048,
  recordBytes: 1024 * 1024,
  checkpointBytes: 64 * 1024,
  issueTextCharacters: 2_048,
  keyHintCharacters: 100,
} as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type ExternalKey = string | number;

export interface CollectionScope {
  pluginId: string;
  sourceId: string;
  scopeType: 'full' | 'asset';
  scopeKey: string;
  configRevision: string;
}

export interface StorageRecord {
  type: string;
  key: ExternalKey;
  values: Record<string, unknown>;
}

export interface StorageRecordReference { type: string; key: ExternalKey }
export interface StorageRelation { type: string; from: StorageRecordReference; to: StorageRecordReference }

export interface StorageIssue {
  sourceIndex: number;
  code: string;
  path: string;
  message: string;
  keyHint?: string;
}

export type CollectionTrigger = 'startup' | 'scheduled' | 'cli' | 'api';
export interface StartCollectionRun extends CollectionScope {
  startedAt: string;
  exclusive?: boolean;
  trigger?: CollectionTrigger;
  requestId?: string;
  scheduledAt?: string;
  scheduleTimezone?: string;
}
export interface FinishCollectionRun { runId: string; status: 'success' | 'partial' | 'failed'; finishedAt: string }
export interface RecordScheduledDuplicate extends CollectionScope {
  activeRunId: string;
  scheduledAt: string;
  scheduleTimezone: string;
  observedAt: string;
}

export interface CommitStorageBatch {
  runId: string;
  scope: CollectionScope;
  observedAt: string;
  expectedCheckpoint: JsonValue | null;
  nextCheckpoint: Exclude<JsonValue, null>;
  processedCount: number;
  acceptedCount: number;
  records: readonly StorageRecord[];
  relations: readonly StorageRelation[];
  issues: readonly StorageIssue[];
}

export interface RecordStorage {
  startRun(input: StartCollectionRun): Promise<string>;
  renewRun?(runId: string): Promise<void>;
  finishRun(input: FinishCollectionRun): Promise<void>;
  recordScheduledDuplicate(input: RecordScheduledDuplicate): Promise<void>;
  getCheckpoint(scope: CollectionScope): Promise<JsonValue | null>;
  commitBatch(input: CommitStorageBatch): Promise<void>;
}

export type StorageErrorCode =
  | 'INVALID_INPUT' | 'DUPLICATE_KEY' | 'RECORD_TOO_LARGE' | 'CHECKPOINT_TOO_LARGE'
  | 'RUN_NOT_FOUND' | 'RUN_NOT_ACTIVE' | 'RUN_ALREADY_ACTIVE' | 'SCOPE_MISMATCH' | 'CHECKPOINT_CONFLICT'
  | 'RELATION_NOT_FOUND' | 'PERSIST_FAILED';

const storageMessages: Record<StorageErrorCode, string> = {
  INVALID_INPUT: '저장 입력 형식과 제한을 확인하세요.',
  DUPLICATE_KEY: '한 묶음에 같은 범위의 중복 레코드 키가 있습니다.',
  RECORD_TOO_LARGE: '레코드 원천 값이 저장 크기 제한을 초과했습니다.',
  CHECKPOINT_TOO_LARGE: 'checkpoint가 저장 크기 제한을 초과했습니다.',
  RUN_NOT_FOUND: '수집 실행을 찾을 수 없습니다.',
  RUN_NOT_ACTIVE: '진행 중인 수집 실행만 변경할 수 있습니다.',
  RUN_ALREADY_ACTIVE: '같은 대상과 범위의 수집이 이미 진행 중입니다.',
  SCOPE_MISMATCH: '수집 실행과 저장 묶음의 범위가 다릅니다.',
  CHECKPOINT_CONFLICT: '저장된 checkpoint와 묶음의 시작 checkpoint가 다릅니다.',
  RELATION_NOT_FOUND: '관계가 참조하는 레코드를 찾을 수 없습니다.',
  PERSIST_FAILED: '플랫폼 데이터 저장에 실패했습니다.',
};

/** 드라이버 오류나 입력 원문을 보관하지 않는 공개 저장 오류. */
export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode, readonly activeRunId?: string) {
    super(storageMessages[code]);
    this.name = 'StorageError';
  }
}

export interface CanonicalKey { type: 'string' | 'number'; value: string }

export function canonicalExternalKey(key: ExternalKey): CanonicalKey {
  if (typeof key === 'string') {
    if (key.length === 0 || key.length > STORAGE_LIMITS.externalKeyCharacters || key.includes('\0')) throw new StorageError('INVALID_INPUT');
    return { type: 'string', value: key };
  }
  if (typeof key !== 'number' || !Number.isFinite(key)) throw new StorageError('INVALID_INPUT');
  return { type: 'number', value: Object.is(key, -0) ? '0' : String(key) };
}

export function serializedBytes(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? Number.POSITIVE_INFINITY : Buffer.byteLength(serialized);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isJsonValue(value: unknown, ancestors = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every(item => isJsonValue(item, ancestors))
    : Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(item => isJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
}

function validText(value: unknown, max: number = STORAGE_LIMITS.identifierCharacters): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0');
}

function validTimestamp(value: string): boolean { return validText(value) && !Number.isNaN(Date.parse(value)); }

function validTimezone(value: unknown): value is string {
  if (!validText(value)) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0); return true; }
  catch { return false; }
}

export function validateScope(scope: CollectionScope): void {
  if (!validText(scope.pluginId) || !validText(scope.sourceId) || !validText(scope.configRevision)) throw new StorageError('INVALID_INPUT');
  if (scope.scopeType === 'full' ? scope.scopeKey !== '' : scope.scopeType !== 'asset' || !validText(scope.scopeKey)) throw new StorageError('INVALID_INPUT');
}

export function validateCommitBatch(input: CommitStorageBatch): void {
  validateScope(input.scope);
  if (!validText(input.runId) || !validTimestamp(input.observedAt) || !Number.isSafeInteger(input.processedCount) || input.processedCount < 0 || !Number.isSafeInteger(input.acceptedCount) || input.acceptedCount < 0 || input.acceptedCount > input.processedCount || input.issues.length > input.processedCount - input.acceptedCount) throw new StorageError('INVALID_INPUT');
  if (input.nextCheckpoint === null) throw new StorageError('INVALID_INPUT');
  if (serializedBytes(input.nextCheckpoint) > STORAGE_LIMITS.checkpointBytes || (input.expectedCheckpoint !== null && serializedBytes(input.expectedCheckpoint) > STORAGE_LIMITS.checkpointBytes)) throw new StorageError('CHECKPOINT_TOO_LARGE');
  const seen = new Set<string>();
  for (const record of input.records) {
    if (!validText(record.type) || record.values === null || typeof record.values !== 'object' || Array.isArray(record.values)) throw new StorageError('INVALID_INPUT');
    if (!isJsonValue(record.values)) throw new StorageError('INVALID_INPUT');
    if (serializedBytes(record.values) > STORAGE_LIMITS.recordBytes) throw new StorageError('RECORD_TOO_LARGE');
    const key = canonicalExternalKey(record.key);
    const scoped = `${record.type.length}:${record.type}:${key.type}:${key.value.length}:${key.value}`;
    if (seen.has(scoped)) throw new StorageError('DUPLICATE_KEY');
    seen.add(scoped);
  }
  for (const relation of input.relations) {
    if (!validText(relation.type) || !validText(relation.from?.type) || !validText(relation.to?.type)) throw new StorageError('INVALID_INPUT');
    canonicalExternalKey(relation.from.key); canonicalExternalKey(relation.to.key);
  }
  for (const issue of input.issues) {
    if (!Number.isSafeInteger(issue.sourceIndex) || issue.sourceIndex < 0 || !validText(issue.code) || !validText(issue.path, STORAGE_LIMITS.issueTextCharacters) || !validText(issue.message, STORAGE_LIMITS.issueTextCharacters) || (issue.keyHint !== undefined && !validText(issue.keyHint, STORAGE_LIMITS.keyHintCharacters))) throw new StorageError('INVALID_INPUT');
  }
}

export function validateStartRun(input: StartCollectionRun): void {
  validateScope(input);
  if (!validTimestamp(input.startedAt)) throw new StorageError('INVALID_INPUT');
  if (input.trigger !== undefined && !['startup', 'scheduled', 'cli', 'api'].includes(input.trigger)) throw new StorageError('INVALID_INPUT');
  if (input.requestId !== undefined && !validText(input.requestId)) throw new StorageError('INVALID_INPUT');
  if (input.requestId !== undefined && input.trigger !== 'api') throw new StorageError('INVALID_INPUT');
  const scheduled = input.trigger === 'scheduled';
  if (scheduled !== (input.scheduledAt !== undefined && input.scheduleTimezone !== undefined)) throw new StorageError('INVALID_INPUT');
  if (scheduled && (!validTimestamp(input.scheduledAt!) || new Date(input.scheduledAt!).toISOString() !== input.scheduledAt || !validTimezone(input.scheduleTimezone))) throw new StorageError('INVALID_INPUT');
}

export function validateScheduledDuplicate(input: RecordScheduledDuplicate): void {
  validateScope(input);
  if (!validText(input.activeRunId) || !validTimestamp(input.observedAt)
    || !validTimestamp(input.scheduledAt) || new Date(input.scheduledAt).toISOString() !== input.scheduledAt
    || !validTimezone(input.scheduleTimezone)) throw new StorageError('INVALID_INPUT');
}
