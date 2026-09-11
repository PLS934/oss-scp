import { serializedBytes, STORAGE_LIMITS, type ExternalKey, type JsonValue } from './storage';

export const QUERY_LIMITS = { defaultList: 50, maxList: 200, summaryFieldBytes: 8 * 1024 } as const;
export interface ListRecordsInput { pluginId: string; sourceId: string; dataType: string; limit?: number }
export interface QueryRecord { id: string; pluginId: string; sourceId: string; dataType: string; externalKey: ExternalKey; sourceValues: Record<string, JsonValue>; firstSeenAt: string; lastSeenAt: string }
export interface QueryRecordSummary extends QueryRecord { omittedFields: string[] }
export interface CollectionStatus { scope: 'source'; status: 'never_collected' | 'running' | 'success' | 'partial' | 'failed'; runId: string | null; startedAt: string | null; finishedAt: string | null }
export interface ListRecordsResult { records: QueryRecordSummary[]; collection: CollectionStatus; lastStoredAt: string | null }
export interface RecordQuery { listRecords(input: ListRecordsInput): Promise<ListRecordsResult>; getRecord(id: string): Promise<QueryRecord | null> }
export type QueryErrorCode = 'INVALID_QUERY' | 'QUERY_FAILED';
const queryMessages: Record<QueryErrorCode, string> = { INVALID_QUERY: '조회 입력을 확인하세요.', QUERY_FAILED: '플랫폼 데이터 조회에 실패했습니다.' };
export class QueryError extends Error { constructor(readonly code: QueryErrorCode) { super(queryMessages[code]); this.name = 'QueryError'; } }
function validIdentifier(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= STORAGE_LIMITS.identifierCharacters && !value.includes('\0'); }
export function validateListRecordsInput(input: ListRecordsInput): Required<ListRecordsInput> {
  if (!validIdentifier(input.pluginId) || !validIdentifier(input.sourceId) || !validIdentifier(input.dataType)) throw new QueryError('INVALID_QUERY');
  const limit = input.limit ?? QUERY_LIMITS.defaultList;
  if (!Number.isInteger(limit) || limit < 1 || limit > QUERY_LIMITS.maxList) throw new QueryError('INVALID_QUERY');
  return { ...input, limit };
}
export function validateRecordId(id: string): void { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new QueryError('INVALID_QUERY'); }
export function summarizeSourceValues(values: Record<string, JsonValue>): { sourceValues: Record<string, JsonValue>; omittedFields: string[] } {
  const sourceValues: Record<string, JsonValue> = {}; const omittedFields: string[] = [];
  for (const key of Object.keys(values).sort()) { if (serializedBytes(values[key]) > QUERY_LIMITS.summaryFieldBytes) omittedFields.push(key); else sourceValues[key] = values[key]; }
  return { sourceValues, omittedFields };
}
