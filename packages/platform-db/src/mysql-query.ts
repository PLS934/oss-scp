import type { RowDataPacket } from 'mysql2/promise';
import type { MysqlPlatformDbConnection } from './mysql';
import { recordQueryScopeIdentity } from './storage-identity';
import {
  encodeRecordCursor, QUERY_LIMITS, QueryError, summarizeSourceValues, validateListRecordsInput, validateRecordId,
  type CollectionStatus, type ListRecordsResult, type QueryRecord, type QueryRecordSummary, type RecordQuery,
} from './query';
import { serializedBytes, type ExternalKey, type JsonValue } from './storage';

interface RecordRow extends RowDataPacket {
  id: string; plugin_id: string; source_id: string; data_type: string; external_key_type: 'string' | 'number';
  external_key: string; source_values: Record<string, JsonValue> | string; first_seen_at: Date | string; last_seen_at: Date | string;
}
interface RunRow extends RowDataPacket { id: string; status: CollectionStatus['status']; started_at: Date | string; finished_at: Date | string | null }
interface StoredRow extends RowDataPacket { last_stored_at: Date | string | null }

function timestamp(value: Date | string): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function sourceValues(value: Record<string, JsonValue> | string): Record<string, JsonValue> { return typeof value === 'string' ? JSON.parse(value) as Record<string, JsonValue> : value; }
function externalKey(row: RecordRow): ExternalKey { return row.external_key_type === 'number' ? Number(row.external_key) : row.external_key; }
function record(row: RecordRow): QueryRecord { return { id: row.id, pluginId: row.plugin_id, sourceId: row.source_id, dataType: row.data_type, externalKey: externalKey(row), sourceValues: sourceValues(row.source_values), firstSeenAt: timestamp(row.first_seen_at), lastSeenAt: timestamp(row.last_seen_at) }; }
function summary(row: RecordRow): QueryRecordSummary {
  const full = record(row);
  const item = { ...full, ...summarizeSourceValues(full.sourceValues) };
  for (const key of Object.keys(item.sourceValues).sort().reverse()) {
    if (serializedBytes(item as unknown as JsonValue) <= QUERY_LIMITS.summaryRecordBytes) break;
    delete item.sourceValues[key]; item.omittedFields.push(key); item.omittedFields.sort();
  }
  return item;
}
function failure(error: unknown): QueryError { return error instanceof QueryError ? error : new QueryError('QUERY_FAILED'); }

export function createMysqlRecordQuery(connection: MysqlPlatformDbConnection): RecordQuery {
  return {
    async listRecords(raw): Promise<ListRecordsResult> {
      const input = validateListRecordsInput(raw);
      try {
        return await connection.withClient(async client => {
          const parameters: unknown[] = [recordQueryScopeIdentity(input.pluginId, input.sourceId, input.dataType)];
          const boundary = input.boundary ? ' AND (last_seen_at < ? OR (last_seen_at = ? AND id > ?))' : '';
          if (input.boundary) parameters.push(new Date(input.boundary.lastSeenAt), new Date(input.boundary.lastSeenAt), input.boundary.id);
          parameters.push(input.limit + 1);
          const [recordRows] = await client.query<RecordRow[]>(`SELECT id, plugin_id, source_id, data_type, external_key_type, external_key, source_values, first_seen_at, last_seen_at
            FROM platform_records WHERE query_scope_hash=?${boundary} ORDER BY last_seen_at DESC, id ASC LIMIT ?`, parameters);
          const [runRows] = await client.query<RunRow[]>(`SELECT id, status, started_at, finished_at FROM collection_runs
            WHERE plugin_id=? AND source_id=? AND scope_type='full' ORDER BY started_at DESC, id DESC LIMIT 1`, [input.pluginId, input.sourceId]);
          const [storedRows] = await client.query<StoredRow[]>('SELECT max(last_seen_at) AS last_stored_at FROM platform_records WHERE query_scope_hash=?', [parameters[0]]);
          const items: QueryRecordSummary[] = [];
          let pageBytes = 2;
          for (const row of recordRows.slice(0, input.limit)) {
            const item = summary(row);
            const itemBytes = serializedBytes(item as unknown as JsonValue) + (items.length === 0 ? 0 : 1);
            if (items.length > 0 && pageBytes + itemBytes > QUERY_LIMITS.summaryPageBytes) break;
            items.push(item); pageBytes += itemBytes;
          }
          const hasNextPage = items.length < recordRows.length;
          const last = items.at(-1);
          const run = runRows[0];
          const lastStored = storedRows[0]?.last_stored_at ?? null;
          return {
            items,
            pageInfo: { nextCursor: hasNextPage && last ? encodeRecordCursor(input, { lastSeenAt: last.lastSeenAt, id: last.id }) : null, hasNextPage },
            lastStoredAt: lastStored === null ? null : timestamp(lastStored),
            collection: run ? { scope: 'source', status: run.status, runId: run.id, startedAt: timestamp(run.started_at), finishedAt: run.finished_at === null ? null : timestamp(run.finished_at) }
              : { scope: 'source', status: 'never_collected', runId: null, startedAt: null, finishedAt: null },
          };
        });
      } catch (error) { throw failure(error); }
    },
    async getRecord(id): Promise<QueryRecord | null> {
      validateRecordId(id);
      try {
        const [rows] = await connection.withClient(client => client.query<RecordRow[]>(`SELECT id, plugin_id, source_id, data_type, external_key_type, external_key, source_values, first_seen_at, last_seen_at
          FROM platform_records WHERE id=?`, [id]));
        return rows[0] ? record(rows[0]) : null;
      } catch (error) { throw failure(error); }
    },
  };
}
