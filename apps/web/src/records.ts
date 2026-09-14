export type RecordFilter =
  | { field: string; kind: 'select'; value: string | number | boolean }
  | { field: string; kind: 'multiSelect'; values: Array<string | number | boolean> }
  | { field: string; kind: 'numberRange'; min?: number; max?: number }
  | { field: string; kind: 'dateRange'; from?: string; to?: string };
export interface SearchConditions { q?: string; filters?: RecordFilter[] }
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type RecordListLimit = 20 | 50 | 100 | 200;

export interface ListRecordsInput extends SearchConditions {
  pluginId: string;
  sourceId: string;
  dataType: string;
  limit?: RecordListLimit;
  cursor?: string;
  page?: number;
}

export interface QueryRecord {
  id: string;
  pluginId: string;
  sourceId: string;
  dataType: string;
  externalKey: string | number;
  sourceValues: Record<string, JsonValue>;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface QueryRecordSummary extends QueryRecord { omittedFields: string[] }
export interface RecordPageInfo { nextCursor: string | null; hasNextPage: boolean }
export interface NumberedPageInfo { page: number; pageSize: RecordListLimit; totalItems: number; totalPages: number; hasNextPage: boolean }
export interface NumberedListRecordsInput extends ListRecordsInput { page: number; cursor?: never }
export interface NumberedListRecordsResult extends Omit<ListRecordsResult, 'pageInfo'> { pageInfo: NumberedPageInfo }
export interface CollectionStatus {
  scope: 'source';
  status: 'never_collected' | 'running' | 'success' | 'partial' | 'failed';
  runId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}
export interface ListRecordsResult {
  items: QueryRecordSummary[];
  pageInfo: RecordPageInfo;
  collection: CollectionStatus;
  lastStoredAt: string | null;
}

export type RecordApiErrorKind = 'INVALID_INPUT' | 'INVALID_CURSOR' | 'NOT_FOUND' | 'NOT_READY' | 'INVALID_RESPONSE' | 'NETWORK_ERROR' | 'ABORTED' | 'API_ERROR';
export interface RecordApiError { kind: RecordApiErrorKind; message: string }
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: RecordApiError };
export interface RecordRequestOptions { signal?: AbortSignal; request?: typeof fetch }

const allowedLimits = new Set<number>([20, 50, 100, 200]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const collectionStatuses = new Set(['never_collected', 'running', 'success', 'partial', 'failed']);
const messages: Record<RecordApiErrorKind, string> = {
  INVALID_INPUT: '조회 입력을 확인해 주세요.',
  INVALID_CURSOR: '목록 cursor를 확인해 주세요.',
  NOT_FOUND: '저장 레코드를 찾을 수 없습니다.',
  NOT_READY: '플랫폼 데이터를 조회할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  INVALID_RESPONSE: '서버 응답을 확인할 수 없습니다.',
  NETWORK_ERROR: '서버에 연결할 수 없습니다.',
  ABORTED: '요청이 취소되었습니다.',
  API_ERROR: '저장 레코드 조회에 실패했습니다.',
};

function failure(kind: RecordApiErrorKind): ApiResult<never> {
  return { ok: false, error: { kind, message: messages[kind] } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (depth >= 100) return false;
  if (Array.isArray(value)) return value.every(item => isJsonValue(item, depth + 1));
  return isObject(value) && Object.values(value).every(item => isJsonValue(item, depth + 1));
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function isRecord(value: unknown): value is QueryRecord {
  if (!isObject(value) || !uuidPattern.test(String(value.id))) return false;
  if (typeof value.pluginId !== 'string' || typeof value.sourceId !== 'string' || typeof value.dataType !== 'string') return false;
  if ((typeof value.externalKey !== 'string' && typeof value.externalKey !== 'number') || (typeof value.externalKey === 'number' && !Number.isFinite(value.externalKey))) return false;
  if (!isObject(value.sourceValues) || !isJsonValue(value.sourceValues)) return false;
  return isTimestamp(value.firstSeenAt) && isTimestamp(value.lastSeenAt);
}

function isRecordSummary(value: unknown): value is QueryRecordSummary {
  if (!isObject(value)) return false;
  const omittedFields = value.omittedFields;
  return isRecord(value) && Array.isArray(omittedFields) && omittedFields.every(field => typeof field === 'string');
}

function isListResult(value: unknown): value is ListRecordsResult {
  if (!isObject(value) || !Array.isArray(value.items) || !value.items.every(isRecordSummary)) return false;
  const pageInfo = value.pageInfo;
  if (!isObject(pageInfo) || typeof pageInfo.hasNextPage !== 'boolean' || (pageInfo.nextCursor !== null && typeof pageInfo.nextCursor !== 'string')) return false;
  if ((pageInfo.hasNextPage && (typeof pageInfo.nextCursor !== 'string' || pageInfo.nextCursor.length === 0)) || (!pageInfo.hasNextPage && pageInfo.nextCursor !== null)) return false;
  return isListMetadata(value);
}

function isListMetadata(value: Record<string, unknown>): boolean {
  const collection = value.collection;
  if (!isObject(collection) || collection.scope !== 'source' || typeof collection.status !== 'string' || !collectionStatuses.has(collection.status)) return false;
  if ((collection.runId !== null && typeof collection.runId !== 'string') || !isNullableTimestamp(collection.startedAt) || !isNullableTimestamp(collection.finishedAt)) return false;
  return isNullableTimestamp(value.lastStoredAt);
}

function isNumberedListResult(value: unknown, input: NumberedListRecordsInput): value is NumberedListRecordsResult {
  if (!isObject(value) || !Array.isArray(value.items) || !value.items.every(isRecordSummary) || !isListMetadata(value)) return false;
  const info = value.pageInfo;
  if (!isObject(info) || 'nextCursor' in info) return false;
  const { page, pageSize, totalItems, totalPages, hasNextPage } = info;
  if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1 || pageSize !== (input.limit ?? 20)) return false;
  if (typeof totalItems !== 'number' || !Number.isSafeInteger(totalItems) || totalItems < 0) return false;
  if (typeof totalPages !== 'number' || totalPages !== Math.ceil(totalItems / (pageSize as number))) return false;
  if (page !== Math.min(input.page, Math.max(1, totalPages)) || hasNextPage !== (page < totalPages)) return false;
  const expectedItems = Math.min(pageSize as number, Math.max(0, totalItems - (page - 1) * (pageSize as number)));
  return value.items.length === expectedItems;
}

function validIdentifier(value: string): boolean {
  return value.trim().length > 0 && !value.includes('\0');
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (isObject(error) && error.name === 'AbortError');
}

async function requestJson<T>(url: string, validate: (value: unknown) => value is T, options: RecordRequestOptions): Promise<ApiResult<T>> {
  if (options.signal?.aborted) return failure('ABORTED');
  try {
    const response = await (options.request ?? fetch)(url, { signal: options.signal });
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    if (!response.ok) {
      if (response.status === 400 && isObject(body) && body.code === 'INVALID_CURSOR') return failure('INVALID_CURSOR');
      if (response.status === 400 && isObject(body) && body.code === 'INVALID_QUERY') return failure('INVALID_INPUT');
      if (response.status === 404 && isObject(body) && body.code === 'RECORD_NOT_FOUND') return failure('NOT_FOUND');
      if (response.status === 503) return failure('NOT_READY');
      return failure('API_ERROR');
    }
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (contentType !== 'application/json') return failure('INVALID_RESPONSE');
    if (!validate(body)) return failure('INVALID_RESPONSE');
    return { ok: true, data: body };
  } catch (error) {
    return failure(isAbort(error, options.signal) ? 'ABORTED' : 'NETWORK_ERROR');
  }
}

export function listRecords(input: NumberedListRecordsInput, options?: RecordRequestOptions): Promise<ApiResult<NumberedListRecordsResult>>;
export function listRecords(input: ListRecordsInput & { page?: undefined }, options?: RecordRequestOptions): Promise<ApiResult<ListRecordsResult>>;
export function listRecords(input: ListRecordsInput, options?: RecordRequestOptions): Promise<ApiResult<ListRecordsResult | NumberedListRecordsResult>>;
export async function listRecords(input: ListRecordsInput, options: RecordRequestOptions = {}): Promise<ApiResult<ListRecordsResult | NumberedListRecordsResult>> {
  if (!validIdentifier(input.pluginId) || !validIdentifier(input.sourceId) || !validIdentifier(input.dataType)) return failure('INVALID_INPUT');
  if (input.limit !== undefined && !allowedLimits.has(input.limit)) return failure('INVALID_INPUT');
  if (input.page !== undefined && (!Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger((input.page - 1) * (input.limit ?? 20)) || input.cursor !== undefined)) return failure('INVALID_INPUT');
  const params = new URLSearchParams({ pluginId: input.pluginId, sourceId: input.sourceId, dataType: input.dataType });
  if (input.limit !== undefined) params.set('limit', String(input.limit));
  if (input.cursor !== undefined) params.set('cursor', input.cursor);
  if (input.q !== undefined) params.set('q', input.q);
  if (input.filters !== undefined) params.set('filters', JSON.stringify(input.filters));
  if (input.page !== undefined) {
    params.set('page', String(input.page));
    return requestJson(`/api/v1/records?${params.toString()}`, (value): value is NumberedListRecordsResult => isNumberedListResult(value, input as NumberedListRecordsInput), options);
  }
  return requestJson(`/api/v1/records?${params.toString()}`, isListResult, options);
}

export async function getRecord(id: string, options: RecordRequestOptions = {}): Promise<ApiResult<QueryRecord>> {
  if (!uuidPattern.test(id)) return failure('INVALID_INPUT');
  return requestJson(`/api/v1/records/${encodeURIComponent(id)}`, isRecord, options);
}

export function listNumberedRecords(input: NumberedListRecordsInput, options: RecordRequestOptions = {}): Promise<ApiResult<NumberedListRecordsResult>> {
  return listRecords(input, options);
}
