import type { PostgresPlatformDbConnection } from './postgres';
import { QueryError, summarizeSourceValues, validateListRecordsInput, validateRecordId, type CollectionStatus, type ListRecordsResult, type QueryRecord, type RecordQuery } from './query';
import type { ExternalKey, JsonValue } from './storage';
interface RecordRow { id: string; plugin_id: string; source_id: string; data_type: string; external_key_type: 'string' | 'number'; external_key: string; source_values: Record<string, JsonValue>; first_seen_at: Date | string; last_seen_at: Date | string }
interface RunRow { id: string; status: CollectionStatus['status']; started_at: Date | string; finished_at: Date | string | null }
function timestamp(value: Date | string): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function externalKey(row: RecordRow): ExternalKey { return row.external_key_type === 'number' ? Number(row.external_key) : row.external_key; }
function record(row: RecordRow): QueryRecord { return { id: row.id, pluginId: row.plugin_id, sourceId: row.source_id, dataType: row.data_type, externalKey: externalKey(row), sourceValues: row.source_values, firstSeenAt: timestamp(row.first_seen_at), lastSeenAt: timestamp(row.last_seen_at) }; }
function failure(error: unknown): QueryError { return error instanceof QueryError ? error : new QueryError('QUERY_FAILED'); }
export function createPostgresRecordQuery(connection: PostgresPlatformDbConnection): RecordQuery {
  return {
    async listRecords(raw): Promise<ListRecordsResult> {
      const input = validateListRecordsInput(raw);
      try { return await connection.withClient(async client => {
        const recordsResult = await client.query<RecordRow>(`SELECT id, plugin_id, source_id, data_type, external_key_type, external_key, source_values, first_seen_at, last_seen_at FROM platform_records WHERE plugin_id=$1 AND source_id=$2 AND data_type=$3 ORDER BY last_seen_at DESC, id ASC LIMIT $4`, [input.pluginId, input.sourceId, input.dataType, input.limit]);
        const runResult = await client.query<RunRow>(`SELECT id, status, started_at, finished_at FROM collection_runs WHERE plugin_id=$1 AND source_id=$2 AND scope_type='full' ORDER BY started_at DESC, id DESC LIMIT 1`, [input.pluginId, input.sourceId]);
        const run = runResult.rows[0]; const records = recordsResult.rows.map(row => ({ ...record(row), ...summarizeSourceValues(row.source_values) }));
        return { records, lastStoredAt: records.length === 0 ? null : records.reduce((latest, item) => item.lastSeenAt > latest ? item.lastSeenAt : latest, records[0]!.lastSeenAt), collection: run ? { scope: 'source', status: run.status, runId: run.id, startedAt: timestamp(run.started_at), finishedAt: run.finished_at === null ? null : timestamp(run.finished_at) } : { scope: 'source', status: 'never_collected', runId: null, startedAt: null, finishedAt: null } };
      }); } catch (error) { throw failure(error); }
    },
    async getRecord(id): Promise<QueryRecord | null> {
      validateRecordId(id);
      try { const result = await connection.withClient(client => client.query<RecordRow>(`SELECT id, plugin_id, source_id, data_type, external_key_type, external_key, source_values, first_seen_at, last_seen_at FROM platform_records WHERE id=$1`, [id])); return result.rows[0] ? record(result.rows[0]) : null; } catch (error) { throw failure(error); }
    },
  };
}
