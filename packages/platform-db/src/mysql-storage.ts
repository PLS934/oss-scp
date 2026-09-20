import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { MysqlPlatformDbConnection } from './mysql';
import {
  collectionScopeIdentity, recordIdentity, recordQueryScopeIdentity, relationIdentity, relationScopeIdentity,
} from './storage-identity';
import {
  canonicalExternalKey, StorageError, validateCommitBatch, validateScope, validateStartRun,
  type CollectionScope, type CommitStorageBatch, type FinishCollectionRun, type JsonValue,
  type RecordStorage, type StartCollectionRun, type StorageRecordReference,
} from './storage';

interface RunRow extends RowDataPacket {
  plugin_id: string; source_id: string; scope_type: CollectionScope['scopeType']; scope_key: string;
  config_revision: string; status: string; isolated_count: number | string; coordinated?: number; lease_valid?: number;
}
interface RecordRow extends RowDataPacket {
  id: string; plugin_id: string; source_id: string; data_type: string;
  external_key_type: 'string' | 'number'; external_key: string;
}
interface RelationRow extends RowDataPacket { relation_type: string; from_record_id: string; to_record_id: string }
interface CheckpointRow extends RowDataPacket {
  plugin_id: string; source_id: string; scope_type: CollectionScope['scopeType']; scope_key: string;
  config_revision: string; checkpoint: JsonValue | string;
}

function scopeValues(scope: CollectionScope): readonly string[] {
  return [scope.pluginId, scope.sourceId, scope.scopeType, scope.scopeKey, scope.configRevision];
}

function sameScope(row: Pick<RunRow, 'plugin_id' | 'source_id' | 'scope_type' | 'scope_key' | 'config_revision'>, scope: CollectionScope): boolean {
  return row.plugin_id === scope.pluginId && row.source_id === scope.sourceId && row.scope_type === scope.scopeType
    && row.scope_key === scope.scopeKey && row.config_revision === scope.configRevision;
}

function parseJson(value: JsonValue | string): JsonValue { return typeof value === 'string' ? JSON.parse(value) as JsonValue : value; }

function normalizedJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(normalizedJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${normalizedJson(value[key]!)}`).join(',')}}`;
}

function refMapKey(reference: StorageRecordReference): string {
  const key = canonicalExternalKey(reference.key);
  return `${reference.type.length}:${reference.type}:${key.type}:${key.value.length}:${key.value}`;
}

function publicFailure(error: unknown): StorageError { return error instanceof StorageError ? error : new StorageError('PERSIST_FAILED'); }
async function rollback(client: PoolConnection): Promise<void> { await client.rollback().catch(() => undefined); }

async function resolveRecordId(client: PoolConnection, scope: CollectionScope, reference: StorageRecordReference, ids: ReadonlyMap<string, string>): Promise<string> {
  const cached = ids.get(refMapKey(reference));
  if (cached) return cached;
  const key = canonicalExternalKey(reference.key);
  const [rows] = await client.query<RecordRow[]>('SELECT id, plugin_id, source_id, data_type, external_key_type, external_key FROM platform_records WHERE identity_hash=?', [recordIdentity(scope.pluginId, scope.sourceId, reference.type, reference.key)]);
  const found = rows[0];
  if (!found || found.plugin_id !== scope.pluginId || found.source_id !== scope.sourceId || found.data_type !== reference.type
    || found.external_key_type !== key.type || found.external_key !== key.value) throw new StorageError('RELATION_NOT_FOUND');
  return found.id;
}

export function createMysqlRecordStorage(connection: MysqlPlatformDbConnection): RecordStorage {
  return {
    async startRun(input: StartCollectionRun): Promise<string> {
      validateStartRun(input);
      const id = randomUUID();
      try {
        await connection.withClient(async client => {
          const hash = collectionScopeIdentity(input);
          const lockName = hash.toString('hex');
          const [locks] = await client.query('SELECT GET_LOCK(?, 5) AS acquired', [lockName]) as [{ acquired: number | null }[], unknown];
          if (locks[0]?.acquired !== 1) throw new StorageError('PERSIST_FAILED');
          try {
            const [active] = await client.query<RunRow[]>(`SELECT id FROM collection_runs WHERE scope_hash=?
              AND status='running' AND coordinated=1 AND heartbeat_at > UTC_TIMESTAMP(3) - INTERVAL 2 MINUTE LIMIT 1`, [hash]);
            if (input.exclusive && active[0]) throw new StorageError('RUN_ALREADY_ACTIVE', active[0].id);
            await client.execute(`UPDATE collection_runs SET status='failed', finished_at=UTC_TIMESTAMP(3)
              WHERE scope_hash=? AND status='running' AND coordinated=1 AND ?=1`, [hash, input.exclusive ? 1 : 0]);
            await client.execute(`INSERT INTO collection_runs
              (id, scope_hash, plugin_id, source_id, scope_type, scope_key, config_revision, started_at, heartbeat_at, coordinated, \`trigger\`, request_id, scheduled_at, schedule_timezone)
              VALUES (?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3),?,?,?,?,?)`, [
                id, hash, ...scopeValues(input), new Date(input.startedAt), input.exclusive ? 1 : 0, input.trigger ?? 'cli', input.requestId ?? null,
                input.scheduledAt ? new Date(input.scheduledAt) : null, input.scheduleTimezone ?? null,
              ]);
          } finally { await client.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined); }
        });
        return id;
      } catch (error) { throw publicFailure(error); }
    },

    async renewRun(runId: string): Promise<void> {
      if (!runId) throw new StorageError('INVALID_INPUT');
      try {
        const [result] = await connection.withClient(client => client.execute(
          "UPDATE collection_runs SET heartbeat_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running'", [runId]));
        if ((result as { affectedRows?: number }).affectedRows !== 1) throw new StorageError('RUN_NOT_ACTIVE');
      } catch (error) { throw publicFailure(error); }
    },

    async finishRun(input: FinishCollectionRun): Promise<void> {
      if (!input.runId || Number.isNaN(Date.parse(input.finishedAt)) || !['success', 'partial', 'failed'].includes(input.status)) throw new StorageError('INVALID_INPUT');
      try {
        await connection.withClient(async client => {
          await client.beginTransaction();
          try {
            const [rows] = await client.query<RunRow[]>(`SELECT status, isolated_count, coordinated,
              heartbeat_at > UTC_TIMESTAMP(3) - INTERVAL 2 MINUTE AS lease_valid FROM collection_runs WHERE id=? FOR UPDATE`, [input.runId]);
            const run = rows[0];
            if (!run) throw new StorageError('RUN_NOT_FOUND');
            if (run.status !== 'running') throw new StorageError('RUN_NOT_ACTIVE');
            if (run.coordinated === 1 && run.lease_valid !== 1) throw new StorageError('RUN_NOT_ACTIVE');
            if ((input.status === 'success' && Number(run.isolated_count) > 0) || (input.status === 'partial' && Number(run.isolated_count) === 0)) throw new StorageError('INVALID_INPUT');
            await client.execute('UPDATE collection_runs SET status=?, finished_at=? WHERE id=?', [input.status, new Date(input.finishedAt), input.runId]);
            await client.commit();
          } catch (error) { await rollback(client); throw error; }
        });
      } catch (error) { throw publicFailure(error); }
    },

    async getCheckpoint(scope: CollectionScope): Promise<JsonValue | null> {
      validateScope(scope);
      try {
        return await connection.withClient(async client => {
          const hash = collectionScopeIdentity(scope);
          const [runs] = await client.query<RunRow[]>('SELECT status FROM collection_runs WHERE scope_hash=? ORDER BY started_at DESC, id DESC LIMIT 1', [hash]);
          if (scope.scopeType === 'full' && ['success', 'partial'].includes(runs[0]?.status ?? '')) return null;
          const [rows] = await client.query<CheckpointRow[]>('SELECT plugin_id, source_id, scope_type, scope_key, config_revision, checkpoint FROM collection_checkpoints WHERE scope_hash=?', [hash]);
          const found = rows[0];
          if (!found) return null;
          if (!sameScope(found, scope)) throw new StorageError('PERSIST_FAILED');
          return parseJson(found.checkpoint);
        });
      } catch (error) { throw publicFailure(error); }
    },

    async commitBatch(input: CommitStorageBatch): Promise<void> {
      validateCommitBatch(input);
      await connection.withClient(async client => {
        const scopeHash = collectionScopeIdentity(input.scope);
        // MySQL GET_LOCK 이름은 64자 제한이므로 SHA-256 hex 자체를 사용한다.
        const lockName = scopeHash.toString('hex');
        let locked = false;
        try {
          const [lockRows] = await client.query<(RowDataPacket & { acquired: number | null })[]>('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
          locked = lockRows[0]?.acquired === 1;
          if (!locked) throw new StorageError('PERSIST_FAILED');
          await client.beginTransaction();

          const [runRows] = await client.query<RunRow[]>(`SELECT plugin_id, source_id, scope_type, scope_key, config_revision, status, isolated_count, coordinated,
            heartbeat_at > UTC_TIMESTAMP(3) - INTERVAL 2 MINUTE AS lease_valid FROM collection_runs WHERE id=? FOR UPDATE`, [input.runId]);
          const run = runRows[0];
          if (!run) throw new StorageError('RUN_NOT_FOUND');
          if (run.status !== 'running') throw new StorageError('RUN_NOT_ACTIVE');
          if (run.coordinated === 1 && run.lease_valid !== 1) throw new StorageError('RUN_NOT_ACTIVE');
          if (!sameScope(run, input.scope)) throw new StorageError('SCOPE_MISMATCH');

          const [checkpointRows] = await client.query<CheckpointRow[]>('SELECT plugin_id, source_id, scope_type, scope_key, config_revision, checkpoint FROM collection_checkpoints WHERE scope_hash=? FOR UPDATE', [scopeHash]);
          const checkpointRow = checkpointRows[0];
          if (checkpointRow && !sameScope(checkpointRow, input.scope)) throw new StorageError('PERSIST_FAILED');
          const current = checkpointRow ? parseJson(checkpointRow.checkpoint) : undefined;
          let completedRunRestart = false;
          if (input.scope.scopeType === 'full' && current !== undefined && input.expectedCheckpoint === null) {
            const [previous] = await client.query<RunRow[]>('SELECT status FROM collection_runs WHERE scope_hash=? AND id<>? ORDER BY started_at DESC, id DESC LIMIT 1', [scopeHash, input.runId]);
            completedRunRestart = ['success', 'partial'].includes(previous[0]?.status ?? '');
          }
          if (current === undefined ? input.expectedCheckpoint !== null
            : input.expectedCheckpoint === null ? !completedRunRestart
            : normalizedJson(current) !== normalizedJson(input.expectedCheckpoint)) throw new StorageError('CHECKPOINT_CONFLICT');

          const ids = new Map<string, string>();
          for (const record of input.records) {
            const key = canonicalExternalKey(record.key);
            const identity = recordIdentity(input.scope.pluginId, input.scope.sourceId, record.type, record.key);
            const [existingRows] = await client.query<RecordRow[]>('SELECT id, plugin_id, source_id, data_type, external_key_type, external_key FROM platform_records WHERE identity_hash=? FOR UPDATE', [identity]);
            const existing = existingRows[0];
            let id: string;
            if (existing) {
              if (existing.plugin_id !== input.scope.pluginId || existing.source_id !== input.scope.sourceId || existing.data_type !== record.type
                || existing.external_key_type !== key.type || existing.external_key !== key.value) throw new StorageError('PERSIST_FAILED');
              id = existing.id;
              await client.execute('UPDATE platform_records SET source_values=?, last_seen_at=?, updated_at=CURRENT_TIMESTAMP(3) WHERE id=?', [JSON.stringify(record.values), new Date(input.observedAt), id]);
            } else {
              id = randomUUID();
              await client.execute(`INSERT INTO platform_records
                (id, identity_hash, query_scope_hash, plugin_id, data_type, source_id, external_key_type, external_key, source_values, first_seen_at, last_seen_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [id, identity, recordQueryScopeIdentity(input.scope.pluginId, input.scope.sourceId, record.type), input.scope.pluginId, record.type, input.scope.sourceId, key.type, key.value, JSON.stringify(record.values), new Date(input.observedAt), new Date(input.observedAt)]);
            }
            ids.set(refMapKey({ type: record.type, key: record.key }), id);
          }

          for (const relation of input.relations) {
            const fromId = await resolveRecordId(client, input.scope, relation.from, ids);
            const toId = await resolveRecordId(client, input.scope, relation.to, ids);
            const identity = relationIdentity(relation.type, fromId, toId);
            const [existingRows] = await client.query<RelationRow[]>('SELECT relation_type, from_record_id, to_record_id FROM platform_record_relations WHERE identity_hash=? FOR UPDATE', [identity]);
            const existing = existingRows[0];
            if (existing && (existing.relation_type !== relation.type || existing.from_record_id !== fromId || existing.to_record_id !== toId)) throw new StorageError('PERSIST_FAILED');
            if (!existing) await client.execute(`INSERT INTO platform_record_relations
              (id, identity_hash, scope_hash, plugin_id, source_id, relation_type, from_record_id, to_record_id)
              VALUES (?,?,?,?,?,?,?,?)`, [randomUUID(), identity, relationScopeIdentity(input.scope.pluginId, input.scope.sourceId), input.scope.pluginId, input.scope.sourceId, relation.type, fromId, toId]);
          }

          for (const issue of input.issues) await client.execute(`INSERT INTO collection_issues
            (id, run_id, batch_start_checkpoint, source_index, code, path, message, key_hint)
            VALUES (?,?,?,?,?,?,?,?)`, [randomUUID(), input.runId, input.expectedCheckpoint === null ? null : JSON.stringify(input.expectedCheckpoint), issue.sourceIndex, issue.code, issue.path, issue.message, issue.keyHint ?? null]);

          if (checkpointRow) {
            await client.execute('UPDATE collection_checkpoints SET checkpoint=?, updated_at=CURRENT_TIMESTAMP(3) WHERE scope_hash=?', [JSON.stringify(input.nextCheckpoint), scopeHash]);
          } else {
            await client.execute(`INSERT INTO collection_checkpoints
              (scope_hash, plugin_id, source_id, scope_type, scope_key, config_revision, checkpoint)
              VALUES (?,?,?,?,?,?,?)`, [scopeHash, ...scopeValues(input.scope), JSON.stringify(input.nextCheckpoint)]);
          }
          await client.execute(`UPDATE collection_runs SET processed_count=processed_count+?,
            accepted_count=accepted_count+?, isolated_count=isolated_count+?, heartbeat_at=UTC_TIMESTAMP(3) WHERE id=?`, [input.processedCount, input.acceptedCount, input.issues.length, input.runId]);
          await client.commit();
        } catch (error) {
          await rollback(client);
          throw publicFailure(error);
        } finally {
          if (locked) await client.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined);
        }
      }).catch(error => { throw publicFailure(error); });
    },
  };
}
