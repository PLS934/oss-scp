import type { PostgresPlatformDbConnection } from './postgres';
import { encodeRecordCursor, QUERY_LIMITS, QueryError, summarizeSourceValues, validateListRecordsInput, validateRecordId, type CollectionStatus, type ListRecordsResult, type QueryRecord, type QueryRecordSummary, type RecordQuery } from './query';
import { serializedBytes, type ExternalKey, type JsonValue } from './storage';
interface RecordRow { id: string; plugin_id: string; source_id: string; data_type: string; external_key_type: 'string' | 'number'; external_key: string; source_values: Record<string, JsonValue>; first_seen_at: Date | string; last_seen_at: Date | string }
interface RunRow { id: string; status: CollectionStatus['status']; started_at: Date | string; finished_at: Date | string | null }
interface StoredRow { last_stored_at: Date | string | null }
function timestamp(value: Date | string): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function externalKey(row: RecordRow): ExternalKey { return row.external_key_type === 'number' ? Number(row.external_key) : row.external_key; }
function record(row: RecordRow): QueryRecord { return { id: row.id, pluginId: row.plugin_id, sourceId: row.source_id, dataType: row.data_type, externalKey: externalKey(row), sourceValues: row.source_values, firstSeenAt: timestamp(row.first_seen_at), lastSeenAt: timestamp(row.last_seen_at) }; }
function summary(row: RecordRow): QueryRecordSummary {
  const item = { ...record(row), ...summarizeSourceValues(row.source_values) };
  for (const key of Object.keys(item.sourceValues).sort().reverse()) {
    if (serializedBytes(item as unknown as JsonValue) <= QUERY_LIMITS.summaryRecordBytes) break;
    delete item.sourceValues[key]; item.omittedFields.push(key); item.omittedFields.sort();
  }
  return item;
}
function failure(error: unknown): QueryError { return error instanceof QueryError ? error : new QueryError('QUERY_FAILED'); }
export function createPostgresRecordQuery(connection: PostgresPlatformDbConnection): RecordQuery {
  return {
    async listRecords(raw): Promise<ListRecordsResult> {
      const input = validateListRecordsInput(raw);
      try { return await connection.withClient(async client => {
        const parameters: unknown[] = [input.pluginId, input.sourceId, input.dataType];
        const boundary = input.boundary ? ` AND (last_seen_at < $4 OR (last_seen_at = $4 AND id > $5))` : '';
        if (input.boundary) parameters.push(input.boundary.lastSeenAt, input.boundary.id);
        parameters.push(input.limit + 1);
        const recordsResult = await client.query<RecordRow>(`SELECT id, plugin_id, source_id, data_type, external_key_type, external_key, source_values, first_seen_at, last_seen_at FROM platform_records WHERE plugin_id=$1 AND source_id=$2 AND data_type=$3${boundary} ORDER BY last_seen_at DESC, id ASC LIMIT $${parameters.length}`, parameters);
        const runResult = await client.query<RunRow>(`SELECT id, status, started_at, finished_at FROM collection_runs WHERE plugin_id=$1 AND source_id=$2 AND scope_type='full' ORDER BY started_at DESC, id DESC LIMIT 1`, [input.pluginId, input.sourceId]);
        const storedResult = await client.query<StoredRow>(`SELECT max(last_seen_at) AS last_stored_at FROM platform_records WHERE plugin_id=$1 AND source_id=$2 AND data_type=$3`, [input.pluginId, input.sourceId, input.dataType]);
        const items: QueryRecordSummary[] = []; let pageBytes = 2;
        for (const row of recordsResult.rows.slice(0, input.limit)) { const item = summary(row); const itemBytes = serializedBytes(item as unknown as JsonValue) + (items.length === 0 ? 0 : 1); if (items.length > 0 && pageBytes + itemBytes > QUERY_LIMITS.summaryPageBytes) break; items.push(item); pageBytes += itemBytes; }
        const hasNextPage = items.length < recordsResult.rows.length; const last = items.at(-1);
        const run = runResult.rows[0]; const lastStored = storedResult.rows[0]?.last_stored_at ?? null;
        return { items, pageInfo: { nextCursor: hasNextPage && last ? encodeRecordCursor(input, { lastSeenAt: last.lastSeenAt, id: last.id }) : null, hasNextPage }, lastStoredAt: lastStored === null ? null : timestamp(lastStored), collection: run ? { scope: 'source', status: run.status, runId: run.id, startedAt: timestamp(run.started_at), finishedAt: run.finished_at === null ? null : timestamp(run.finished_at) } : { scope: 'source', status: 'never_collected', runId: null, startedAt: null, finishedAt: null } };
      }); } catch (error) { throw failure(error); }
    },
    async getRecord(id): Promise<QueryRecord | null> { validateRecordId(id); try { const result = await connection.withClient(client => client.query<RecordRow>(`SELECT id, plugin_id, source_id, data_type, external_key_type, external_key, source_values, first_seen_at, last_seen_at FROM platform_records WHERE id=$1`, [id])); return result.rows[0] ? record(result.rows[0]) : null; } catch (error) { throw failure(error); } },
  };
}
