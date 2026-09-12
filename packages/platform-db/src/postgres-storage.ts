import type { PoolClient } from 'pg';
import type { PostgresPlatformDbConnection } from './postgres';
import {
  canonicalExternalKey, StorageError, validateCommitBatch, validateScope, validateStartRun,
  type CollectionScope, type CommitStorageBatch, type FinishCollectionRun, type JsonValue,
  type RecordStorage, type StartCollectionRun, type StorageRecordReference,
} from './storage';

interface RunRow {
  plugin_id: string; source_id: string; scope_type: CollectionScope['scopeType'];
  scope_key: string; config_revision: string; status: string; isolated_count: string; coordinated?: boolean; lease_valid?: boolean;
}

interface RunStatusRow { status: string }

function sameScope(row: RunRow, scope: CollectionScope): boolean {
  return row.plugin_id === scope.pluginId && row.source_id === scope.sourceId && row.scope_type === scope.scopeType
    && row.scope_key === scope.scopeKey && row.config_revision === scope.configRevision;
}

function scopeValues(scope: CollectionScope): readonly string[] {
  return [scope.pluginId, scope.sourceId, scope.scopeType, scope.scopeKey, scope.configRevision];
}

function scopeLockKey(scope: CollectionScope): string { return scopeValues(scope).join('\u001f'); }

async function rollback(client: PoolClient): Promise<void> { await client.query('ROLLBACK').catch(() => undefined); }

async function jsonbEqual(client: PoolClient, left: unknown, right: unknown): Promise<boolean> {
  const result = await client.query<{ equal: boolean }>('SELECT $1::jsonb = $2::jsonb AS equal', [JSON.stringify(left), JSON.stringify(right)]);
  return result.rows[0]?.equal === true;
}

function refMapKey(reference: StorageRecordReference): string {
  const key = canonicalExternalKey(reference.key);
  return `${reference.type.length}:${reference.type}:${key.type}:${key.value.length}:${key.value}`;
}

async function resolveRecordId(client: PoolClient, scope: CollectionScope, reference: StorageRecordReference, ids: ReadonlyMap<string, string>): Promise<string> {
  const cached = ids.get(refMapKey(reference));
  if (cached) return cached;
  const key = canonicalExternalKey(reference.key);
  const found = await client.query<{ id: string }>(`SELECT id FROM platform_records
    WHERE plugin_id=$1 AND source_id=$2 AND data_type=$3 AND external_key_type=$4 AND external_key=$5`,
  [scope.pluginId, scope.sourceId, reference.type, key.type, key.value]);
  if (!found.rows[0]) throw new StorageError('RELATION_NOT_FOUND');
  return found.rows[0].id;
}

function publicFailure(error: unknown): StorageError {
  return error instanceof StorageError ? error : new StorageError('PERSIST_FAILED');
}

export function createPostgresRecordStorage(connection: PostgresPlatformDbConnection): RecordStorage {
  return {
    async startRun(input: StartCollectionRun): Promise<string> {
      validateStartRun(input);
      try {
        return await connection.withClient(async client => {
          await client.query('BEGIN');
          try {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [scopeLockKey(input)]);
            const active = await client.query(`SELECT id FROM collection_runs WHERE plugin_id=$1 AND source_id=$2
              AND scope_type=$3 AND scope_key=$4 AND status='running'
              AND coordinated AND heartbeat_at > now() - interval '2 minutes' LIMIT 1`, scopeValues(input).slice(0, 4));
            if (input.exclusive && active.rows[0]) throw new StorageError('RUN_ALREADY_ACTIVE');
            await client.query(`UPDATE collection_runs SET status='failed', finished_at=now()
              WHERE plugin_id=$1 AND source_id=$2 AND scope_type=$3 AND scope_key=$4 AND status='running' AND coordinated AND $5::boolean`, [...scopeValues(input).slice(0, 4), input.exclusive === true]);
            const result = await client.query<{ id: string }>(`INSERT INTO collection_runs
              (plugin_id, source_id, scope_type, scope_key, config_revision, started_at, heartbeat_at, coordinated)
              VALUES ($1,$2,$3,$4,$5,$6,now(),$7) RETURNING id`, [...scopeValues(input), input.startedAt, input.exclusive === true]);
            await client.query('COMMIT');
            if (!result.rows[0]) throw new StorageError('PERSIST_FAILED');
            return result.rows[0].id;
          } catch (error) { await rollback(client); throw error; }
        });
      } catch (error) { throw publicFailure(error); }
    },

    async renewRun(runId: string): Promise<void> {
      if (!runId) throw new StorageError('INVALID_INPUT');
      try {
        const result = await connection.withClient(client => client.query(
          "UPDATE collection_runs SET heartbeat_at=now() WHERE id=$1 AND status='running'", [runId]));
        if (result.rowCount !== 1) throw new StorageError('RUN_NOT_ACTIVE');
      } catch (error) { throw publicFailure(error); }
    },

    async finishRun(input: FinishCollectionRun): Promise<void> {
      if (!input.runId || Number.isNaN(Date.parse(input.finishedAt)) || !['success', 'partial', 'failed'].includes(input.status)) throw new StorageError('INVALID_INPUT');
      try {
        await connection.withClient(async client => {
          const found = await client.query<{ status: string; isolated_count: string; coordinated: boolean; lease_valid: boolean }>(`SELECT status, isolated_count, coordinated,
            heartbeat_at > now() - interval '2 minutes' AS lease_valid FROM collection_runs WHERE id=$1`, [input.runId]);
          const run = found.rows[0];
          if (!run) throw new StorageError('RUN_NOT_FOUND');
          if (run.status !== 'running') throw new StorageError('RUN_NOT_ACTIVE');
          if (run.coordinated && !run.lease_valid) throw new StorageError('RUN_NOT_ACTIVE');
          if ((input.status === 'success' && Number(run.isolated_count) > 0) || (input.status === 'partial' && Number(run.isolated_count) === 0)) throw new StorageError('INVALID_INPUT');
          await client.query('UPDATE collection_runs SET status=$2, finished_at=$3 WHERE id=$1', [input.runId, input.status, input.finishedAt]);
        });
      } catch (error) { throw publicFailure(error); }
    },

    async getCheckpoint(scope: CollectionScope): Promise<JsonValue | null> {
      validateScope(scope);
      try {
        return await connection.withClient(async client => {
          const runResult = await client.query<RunStatusRow>(`SELECT status FROM collection_runs
            WHERE plugin_id=$1 AND source_id=$2 AND scope_type=$3 AND scope_key=$4 AND config_revision=$5
            ORDER BY started_at DESC, id DESC LIMIT 1`, [...scopeValues(scope)]);
          if (scope.scopeType === 'full' && ['success', 'partial'].includes(runResult.rows[0]?.status ?? '')) return null;
          const result = await client.query<{ checkpoint: JsonValue }>(`SELECT checkpoint FROM collection_checkpoints
            WHERE plugin_id=$1 AND source_id=$2 AND scope_type=$3 AND scope_key=$4 AND config_revision=$5`, [...scopeValues(scope)]);
          return result.rows[0]?.checkpoint ?? null;
        });
      } catch (error) { throw publicFailure(error); }
    },

    async commitBatch(input: CommitStorageBatch): Promise<void> {
      validateCommitBatch(input);
      await connection.withClient(async client => {
        await client.query('BEGIN');
        try {
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [scopeLockKey(input.scope)]);
          const runResult = await client.query<RunRow>(`SELECT plugin_id, source_id, scope_type, scope_key, config_revision, status, isolated_count, coordinated,
              heartbeat_at > now() - interval '2 minutes' AS lease_valid
            FROM collection_runs WHERE id=$1 FOR UPDATE`, [input.runId]);
          const run = runResult.rows[0];
          if (!run) throw new StorageError('RUN_NOT_FOUND');
          if (run.status !== 'running') throw new StorageError('RUN_NOT_ACTIVE');
          if (run.coordinated && !run.lease_valid) throw new StorageError('RUN_NOT_ACTIVE');
          if (!sameScope(run, input.scope)) throw new StorageError('SCOPE_MISMATCH');

          const checkpointResult = await client.query<{ checkpoint: JsonValue }>(`SELECT checkpoint FROM collection_checkpoints
            WHERE plugin_id=$1 AND source_id=$2 AND scope_type=$3 AND scope_key=$4 AND config_revision=$5 FOR UPDATE`, [...scopeValues(input.scope)]);
          const current = checkpointResult.rows[0]?.checkpoint;
          let completedRunRestart = false;
          if (input.scope.scopeType === 'full' && current !== undefined && input.expectedCheckpoint === null) {
            const previous = await client.query<RunStatusRow>(`SELECT status FROM collection_runs
              WHERE plugin_id=$1 AND source_id=$2 AND scope_type=$3 AND scope_key=$4 AND config_revision=$5 AND id<>$6
              ORDER BY started_at DESC, id DESC LIMIT 1`, [...scopeValues(input.scope), input.runId]);
            completedRunRestart = ['success', 'partial'].includes(previous.rows[0]?.status ?? '');
          }
          if (current === undefined ? input.expectedCheckpoint !== null
            : input.expectedCheckpoint === null ? !completedRunRestart
            : !(await jsonbEqual(client, current, input.expectedCheckpoint))) throw new StorageError('CHECKPOINT_CONFLICT');

          const ids = new Map<string, string>();
          for (const record of input.records) {
            const key = canonicalExternalKey(record.key);
            const result = await client.query<{ id: string }>(`INSERT INTO platform_records
              (plugin_id, data_type, source_id, external_key_type, external_key, source_values, first_seen_at, last_seen_at)
              VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7)
              ON CONFLICT (plugin_id, data_type, source_id, external_key_type, external_key) DO UPDATE
              SET source_values=EXCLUDED.source_values, last_seen_at=EXCLUDED.last_seen_at, updated_at=now()
              RETURNING id`, [input.scope.pluginId, record.type, input.scope.sourceId, key.type, key.value, JSON.stringify(record.values), input.observedAt]);
            if (!result.rows[0]) throw new StorageError('PERSIST_FAILED');
            ids.set(refMapKey({ type: record.type, key: record.key }), result.rows[0].id);
          }

          for (const relation of input.relations) {
            const fromId = await resolveRecordId(client, input.scope, relation.from, ids);
            const toId = await resolveRecordId(client, input.scope, relation.to, ids);
            await client.query(`INSERT INTO platform_record_relations(plugin_id, source_id, relation_type, from_record_id, to_record_id)
              VALUES ($1,$2,$3,$4,$5) ON CONFLICT (relation_type, from_record_id, to_record_id) DO NOTHING`,
            [input.scope.pluginId, input.scope.sourceId, relation.type, fromId, toId]);
          }

          for (const issue of input.issues) await client.query(`INSERT INTO collection_issues
            (run_id, batch_start_checkpoint, source_index, code, path, message, key_hint)
            VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7)`, [input.runId, input.expectedCheckpoint === null ? null : JSON.stringify(input.expectedCheckpoint), issue.sourceIndex, issue.code, issue.path, issue.message, issue.keyHint ?? null]);

          await client.query(`INSERT INTO collection_checkpoints(plugin_id, source_id, scope_type, scope_key, config_revision, checkpoint)
            VALUES ($1,$2,$3,$4,$5,$6::jsonb)
            ON CONFLICT (plugin_id, source_id, scope_type, scope_key, config_revision) DO UPDATE
            SET checkpoint=EXCLUDED.checkpoint, updated_at=now()`, [...scopeValues(input.scope), JSON.stringify(input.nextCheckpoint)]);
          await client.query(`UPDATE collection_runs SET processed_count=processed_count+$2,
            accepted_count=accepted_count+$3, isolated_count=isolated_count+$4, heartbeat_at=now() WHERE id=$1`,
          [input.runId, input.processedCount, input.acceptedCount, input.issues.length]);
          await client.query('COMMIT');
        } catch (error) {
          await rollback(client);
          throw publicFailure(error);
        }
      }).catch(error => { throw publicFailure(error); });
    },
  };
}
