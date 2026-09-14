import { Buffer } from 'node:buffer';
import { serializedBytes, STORAGE_LIMITS, type ExternalKey, type JsonValue } from './storage';

export const QUERY_LIMITS = {
  allowedListSizes: [20, 50, 100, 200], defaultList: 20, maxCursorCharacters: 4096,
  summaryFieldBytes: 8 * 1024, summaryRecordBytes: 64 * 1024, summaryPageBytes: 4 * 1024 * 1024,
} as const;
export const RECORD_LIST_SORT = 'lastSeenAt-desc-id-asc' as const;
export interface ListRecordsInput { pluginId: string; sourceId: string; dataType: string; limit?: number; cursor?: string; page?: number }
export interface RecordCursorBoundary { lastSeenAt: string; id: string }
export interface NormalizedListRecordsInput { pluginId: string; sourceId: string; dataType: string; limit: number; boundary?: RecordCursorBoundary; page?: number }
export interface QueryRecord { id: string; pluginId: string; sourceId: string; dataType: string; externalKey: ExternalKey; sourceValues: Record<string, JsonValue>; firstSeenAt: string; lastSeenAt: string }
export interface QueryRecordSummary extends QueryRecord { omittedFields: string[] }
export interface CollectionStatus { scope: 'source'; status: 'never_collected' | 'running' | 'success' | 'partial' | 'failed'; runId: string | null; startedAt: string | null; finishedAt: string | null }
export interface RecordPageInfo { nextCursor: string | null; hasNextPage: boolean }
export interface ListRecordsResult { items: QueryRecordSummary[]; pageInfo: RecordPageInfo; collection: CollectionStatus; lastStoredAt: string | null }
export interface NumberedRecordPageInfo { page: number; pageSize: number; totalItems: number; totalPages: number; hasNextPage: boolean }
export interface NumberedListRecordsResult extends Omit<ListRecordsResult, 'pageInfo'> { pageInfo: NumberedRecordPageInfo }
export interface AnyListRecordsResult extends Omit<ListRecordsResult, 'pageInfo'> { pageInfo: RecordPageInfo | NumberedRecordPageInfo }
export interface RecordQuery {
  listRecords(input: ListRecordsInput & { page: number }): Promise<NumberedListRecordsResult>;
  listRecords(input: ListRecordsInput & { page?: undefined }): Promise<ListRecordsResult>;
  listRecords(input: ListRecordsInput): Promise<AnyListRecordsResult>;
  getRecord(id: string): Promise<QueryRecord | null>;
}
export type QueryErrorCode = 'INVALID_QUERY' | 'INVALID_CURSOR' | 'QUERY_FAILED';
const queryMessages: Record<QueryErrorCode, string> = { INVALID_QUERY: '조회 입력을 확인하세요.', INVALID_CURSOR: '목록 cursor를 확인하세요.', QUERY_FAILED: '플랫폼 데이터 조회에 실패했습니다.' };
interface CursorPayload { v: 1; pluginId: string; sourceId: string; dataType: string; limit: number; sort: typeof RECORD_LIST_SORT; lastSeenAt: string; id: string }
export class QueryError extends Error { constructor(readonly code: QueryErrorCode) { super(queryMessages[code]); this.name = 'QueryError'; } }
function validIdentifier(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= STORAGE_LIMITS.identifierCharacters && !value.includes('\0'); }
function validRecordId(id: unknown): id is string { return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }
function validTimestamp(value: unknown): value is string { if (typeof value !== 'string') return false; try { return new Date(value).toISOString() === value; } catch { return false; } }
function decodeCursor(cursor: string): CursorPayload {
  if (cursor.length === 0 || cursor.length > QUERY_LIMITS.maxCursorCharacters || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new QueryError('INVALID_CURSOR');
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new QueryError('INVALID_CURSOR');
    const value = parsed as Record<string, unknown>;
    const expectedKeys = ['dataType', 'id', 'lastSeenAt', 'limit', 'pluginId', 'sort', 'sourceId', 'v'];
    if (Object.keys(value).sort().join(',') !== expectedKeys.join(',')) throw new QueryError('INVALID_CURSOR');
    if (value.v !== 1 || value.sort !== RECORD_LIST_SORT || !validIdentifier(value.pluginId) || !validIdentifier(value.sourceId) || !validIdentifier(value.dataType) || !Number.isInteger(value.limit) || !validTimestamp(value.lastSeenAt) || !validRecordId(value.id)) throw new QueryError('INVALID_CURSOR');
    return value as unknown as CursorPayload;
  } catch (error) { if (error instanceof QueryError) throw error; throw new QueryError('INVALID_CURSOR'); }
}
export function encodeRecordCursor(input: Pick<NormalizedListRecordsInput, 'pluginId' | 'sourceId' | 'dataType' | 'limit'>, boundary: RecordCursorBoundary): string {
  return Buffer.from(JSON.stringify({ v: 1, pluginId: input.pluginId, sourceId: input.sourceId, dataType: input.dataType, limit: input.limit, sort: RECORD_LIST_SORT, ...boundary } satisfies CursorPayload)).toString('base64url');
}
export function validateListRecordsInput(input: ListRecordsInput): NormalizedListRecordsInput {
  if (!validIdentifier(input.pluginId) || !validIdentifier(input.sourceId) || !validIdentifier(input.dataType)) throw new QueryError('INVALID_QUERY');
  const limit = input.limit ?? QUERY_LIMITS.defaultList;
  if (!Number.isInteger(limit) || !(QUERY_LIMITS.allowedListSizes as readonly number[]).includes(limit)) throw new QueryError('INVALID_QUERY');
  if (input.page !== undefined) {
    if (!Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger((input.page - 1) * limit) || input.cursor !== undefined) throw new QueryError('INVALID_QUERY');
    return { pluginId: input.pluginId, sourceId: input.sourceId, dataType: input.dataType, limit, page: input.page };
  }
  if (input.cursor === undefined) return { pluginId: input.pluginId, sourceId: input.sourceId, dataType: input.dataType, limit };
  const cursor = decodeCursor(input.cursor);
  if (cursor.pluginId !== input.pluginId || cursor.sourceId !== input.sourceId || cursor.dataType !== input.dataType || cursor.limit !== limit) throw new QueryError('INVALID_CURSOR');
  return { pluginId: input.pluginId, sourceId: input.sourceId, dataType: input.dataType, limit, boundary: { lastSeenAt: cursor.lastSeenAt, id: cursor.id } };
}
export function validateRecordId(id: string): void { if (!validRecordId(id)) throw new QueryError('INVALID_QUERY'); }
export function summarizeSourceValues(values: Record<string, JsonValue>): { sourceValues: Record<string, JsonValue>; omittedFields: string[] } {
  const sourceValues: Record<string, JsonValue> = {}; const omittedFields: string[] = [];
  for (const key of Object.keys(values).sort()) { const value = values[key]!; if (serializedBytes(value) > QUERY_LIMITS.summaryFieldBytes || serializedBytes({ ...sourceValues, [key]: value }) > QUERY_LIMITS.summaryRecordBytes) omittedFields.push(key); else sourceValues[key] = value; }
  return { sourceValues, omittedFields };
}

export function numberedPageInfo(total: unknown, requestedPage: number, pageSize: number): NumberedRecordPageInfo {
  const totalItems = typeof total === 'string' && /^\d+$/.test(total) ? Number(total) : total;
  if (typeof totalItems !== 'number' || !Number.isSafeInteger(totalItems) || totalItems < 0) throw new QueryError('QUERY_FAILED');
  const totalPages = Math.ceil(totalItems / pageSize);
  const page = Math.min(requestedPage, Math.max(1, totalPages));
  return { page, pageSize, totalItems, totalPages, hasNextPage: page < totalPages };
}
export function summarizeNumberedRecords(records: QueryRecord[], limit: number): QueryRecordSummary[] {
  const budget = Math.min(QUERY_LIMITS.summaryRecordBytes, Math.floor((QUERY_LIMITS.summaryPageBytes - 2 - Math.max(0, limit - 1)) / limit));
  return records.map(record => {
    const item = { ...record, ...summarizeSourceValues(record.sourceValues) };
    for (const key of Object.keys(item.sourceValues).sort().reverse()) {
      if (serializedBytes(item as unknown as JsonValue) <= budget) break;
      delete item.sourceValues[key]; item.omittedFields.push(key); item.omittedFields.sort();
    }
    if (serializedBytes(item as unknown as JsonValue) > budget) throw new QueryError('QUERY_FAILED');
    return item;
  });
}
