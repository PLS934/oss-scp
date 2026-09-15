import { verifySearchContract } from './search-contract.mjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GenericContainer, Wait } from 'testcontainers';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  createPostgresRecordQuery, createPostgresRecordStorage, defaultMigrationsDirectory,
  discoverMigrations, MigrationError,
  postgresAdapter, postgresPoolConfig, runMigrations,
} from '../dist/index.js';
import { verifyRecordContract, verifyNumberedSnapshot } from './record-contract.mjs';

const password = 'integration-password';
let container;
let tlsContainer;
const config = patch => ({
  type: 'postgres', host: container.getHost(), port: container.getMappedPort(5432),
  database: 'oss_scp', user: 'oss_scp_app', password, poolMax: 3,
  connectTimeoutMs: 1500, tls: { mode: 'disable' }, ...patch,
});

beforeAll(async () => {
  container = await new GenericContainer('postgres:17.6-bookworm')
    .withEnvironment({ POSTGRES_DB: 'oss_scp', POSTGRES_USER: 'oss_scp_app', POSTGRES_PASSWORD: password })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  tlsContainer = await new GenericContainer('postgres:17.6-bookworm')
    .withEnvironment({ POSTGRES_DB: 'oss_scp', POSTGRES_USER: 'oss_scp_app', POSTGRES_PASSWORD: password })
    .withCommand(['bash', '-c', "openssl req -new -x509 -days 1 -nodes -subj /CN=untrusted.invalid -keyout /tmp/server.key -out /tmp/server.crt >/dev/null 2>&1 && chmod 600 /tmp/server.key && chown postgres:postgres /tmp/server.key /tmp/server.crt && exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key"])
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
}, 120_000);
afterAll(async () => { await Promise.all([container?.stop(), tlsContainer?.stop()]); });

describe('PostgreSQL 어댑터', () => {
  it('설정을 pool 옵션으로 변환한다', () => {
    expect(postgresPoolConfig(config())).toMatchObject({ max: 3, connectionTimeoutMillis: 1500, ssl: false });
    expect(postgresPoolConfig(config({ tls: { mode: 'verify-full', ca: 'PEM' } })).ssl).toEqual({ rejectUnauthorized: true, ca: 'PEM' });
  });
  it('실제 DB의 준비 상태와 반복 종료를 처리한다', async () => {
    const connection = await postgresAdapter.connect(config());
    expect(await connection.checkReady()).toBe(true);
    await Promise.all([connection.close(), connection.close()]);
    expect(await connection.checkReady()).toBe(false);
  });
  it('인증·접속·TLS 실패를 고정 오류로 바꾸고 평문 전환하지 않는다', async () => {
    for (const patch of [
      { password: 'wrong' }, { port: 1, connectTimeoutMs: 100 }, { tls: { mode: 'verify-full' } },
    ]) await expect(postgresAdapter.connect(config(patch))).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
    await expect(postgresAdapter.connect(config({ host: tlsContainer.getHost(), port: tlsContainer.getMappedPort(5432), tls: { mode: 'verify-full' } }))).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
  });
});

describe('migration', () => {
  it('CLI 설정·연결 실패가 0이 아닌 코드와 비밀정보 없는 오류를 반환한다', () => {
    const missing = spawnSync(process.execPath, ['dist/migrate-cli.js'], { cwd: join(import.meta.dirname, '..'), encoding: 'utf8', env: {} });
    expect(missing.status).not.toBe(0);
    expect(`${missing.stdout}${missing.stderr}`).toContain('PLATFORM_DB_TYPE');
    const marker = 'sensitive-cli-password';
    const failed = spawnSync(process.execPath, ['dist/migrate-cli.js'], { cwd: join(import.meta.dirname, '..'), encoding: 'utf8', env: {
      PLATFORM_DB_TYPE: 'postgres', PLATFORM_DB_HOST: '127.0.0.1', PLATFORM_DB_PORT: '1', PLATFORM_DB_NAME: 'oss_scp', PLATFORM_DB_USER: 'app', PLATFORM_DB_PASSWORD: marker, PLATFORM_DB_TLS_MODE: 'disable', PLATFORM_DB_CONNECT_TIMEOUT_MS: '100',
    } });
    expect(failed.status).not.toBe(0);
    expect(`${failed.stdout}${failed.stderr}`).toContain('플랫폼 DB에 연결할 수 없습니다.');
    expect(`${failed.stdout}${failed.stderr}`).not.toContain(marker);
  });
  it('파일을 정렬하고 중복 버전을 거부한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrations-'));
    try {
      writeFileSync(join(dir, '0002-second.sql'), 'SELECT 2;'); writeFileSync(join(dir, '0001-first.sql'), 'SELECT 1;');
      expect(discoverMigrations(dir).map(item => item.version)).toEqual([1, 2]);
      writeFileSync(join(dir, '0001-duplicate.sql'), 'SELECT 3;');
      expect(() => discoverMigrations(dir)).toThrow(MigrationError);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('최초 적용·재실행·checksum·실패 rollback을 검증한다', async () => {
    const connection = await postgresAdapter.connect(config());
    const one = { version: 101, name: 'create-check', sql: 'CREATE TABLE migration_check(id integer);', checksum: 'one' };
    try {
      expect(await runMigrations(connection, [one], 1500)).toBe(1);
      expect(await runMigrations(connection, [one], 1500)).toBe(0);
      await expect(runMigrations(connection, [{ ...one, checksum: 'changed' }], 1500)).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
      const bad = { version: 102, name: 'bad', sql: 'CREATE TABLE rolled_back(id integer); INVALID SQL;', checksum: 'bad' };
      await expect(runMigrations(connection, [one, bad], 1500)).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
      const exists = await connection.withClient(client => client.query("SELECT to_regclass('rolled_back') AS name"));
      expect(exists.rows[0].name).toBeNull();
    } finally { await connection.close(); }
  });
  it('동시 실행을 DB 잠금으로 직렬화한다', async () => {
    const first = await postgresAdapter.connect(config());
    const second = await postgresAdapter.connect(config());
    const migration = { version: 103, name: 'concurrent', sql: 'CREATE TABLE concurrent_check(id integer);', checksum: 'concurrent' };
    try {
      expect((await Promise.all([runMigrations(first, [migration], 5000), runMigrations(second, [migration], 5000)])).sort()).toEqual([0, 1]);
    } finally { await Promise.all([first.close(), second.close()]); }
  });
});

describe('PostgreSQL 공통 레코드 저장 계약', () => {
  let connection;
  let storage;
  let query;

  beforeAll(async () => {
    connection = await postgresAdapter.connect(config());
    await runMigrations(connection, discoverMigrations(defaultMigrationsDirectory('postgres')), 5000);
    storage = createPostgresRecordStorage(connection);
    query = createPostgresRecordQuery(connection);
  });
  afterAll(async () => { await connection?.close(); });

  const testScope = suffix => ({
    pluginId: `plugin-${suffix}-${randomUUID()}`,
    sourceId: 'source-a', scopeType: 'full', scopeKey: '', configRevision: 'rev-1',
  });
  const start = async scope => storage.startRun({ ...scope, startedAt: '2026-09-11T01:00:00Z' });
  const commit = (runId, scope, patch = {}) => storage.commitBatch({
    runId, scope, observedAt: '2026-09-11T01:01:00Z', expectedCheckpoint: null,
    nextCheckpoint: { offset: 1 }, processedCount: 1, acceptedCount: 1,
    records: [{ type: 'asset', key: 'server-1', values: { hostname: 'old' } }],
    relations: [], issues: [], ...patch,
  });

  it('count 이후 수집이 추가돼도 번호형 items는 같은 snapshot을 사용한다', async () => {
    await verifyNumberedSnapshot(storage, connection, createPostgresRecordQuery, testScope('numbered-snapshot'));
  });

  it('제품 중립 공통 fixture를 통과한다', async () => {
    await verifyRecordContract(storage, query, testScope('shared-contract'));
    await verifySearchContract(storage, query, testScope('search-contract'));
  });

  it('migration을 재실행하고 실행 상태를 기록한다', async () => {
    expect(await runMigrations(connection, discoverMigrations(defaultMigrationsDirectory('postgres')), 5000)).toBe(0);
    const scope = testScope('run');
    const runId = await start(scope);
    await commit(runId, scope);
    await storage.finishRun({ runId, status: 'success', finishedAt: '2026-09-11T01:02:00Z' });
    const result = await connection.withClient(client => client.query('SELECT status, processed_count, accepted_count, isolated_count, finished_at FROM collection_runs WHERE id=$1', [runId]));
    expect(result.rows[0]).toMatchObject({ status: 'success', processed_count: '1', accepted_count: '1', isolated_count: '0' });
    expect(result.rows[0].finished_at).toBeInstanceOf(Date);
    await expect(storage.finishRun({ runId, status: 'success', finishedAt: '2026-09-11T01:03:00Z' })).rejects.toMatchObject({ code: 'RUN_NOT_ACTIVE' });
  });

  it('재전달은 내부 ID를 유지하고 타입·출처 범위는 분리한다', async () => {
    const scope = testScope('identity');
    const firstRun = await start(scope);
    await commit(firstRun, scope, {
      processedCount: 2, acceptedCount: 2,
      records: [
        { type: 'asset', key: '1', values: { hostname: 'string-key' } },
        { type: 'asset', key: 1, values: { hostname: 'number-key' } },
      ],
    });
    const before = await connection.withClient(client => client.query('SELECT id, external_key_type, source_values FROM platform_records WHERE plugin_id=$1 ORDER BY external_key_type DESC', [scope.pluginId]));
    expect(before.rows).toHaveLength(2);

    const secondRun = await start(scope);
    await commit(secondRun, scope, {
      records: [{ type: 'asset', key: '1', values: { hostname: 'updated' } }],
      expectedCheckpoint: { offset: 1 }, nextCheckpoint: { offset: 2 },
    });
    const updated = await connection.withClient(client => client.query("SELECT id, source_values FROM platform_records WHERE plugin_id=$1 AND external_key_type='string'", [scope.pluginId]));
    expect(updated.rows[0]).toEqual({ id: before.rows.find(row => row.external_key_type === 'string').id, source_values: { hostname: 'updated' } });

    const otherScope = { ...scope, sourceId: 'source-b' };
    const otherRun = await start(otherScope);
    await commit(otherRun, otherScope, { records: [{ type: 'asset', key: '1', values: { hostname: 'other' } }] });
    const count = await connection.withClient(client => client.query('SELECT count(*) AS count FROM platform_records WHERE plugin_id=$1', [scope.pluginId]));
    expect(count.rows[0].count).toBe('3');
  });

  it('관계를 내부 ID로 멱등 저장하고 누락 참조 시 묶음을 rollback한다', async () => {
    const scope = testScope('relation');
    const failedRun = await start(scope);
    await expect(commit(failedRun, scope, {
      records: [{ type: 'asset', key: 'server-1', values: { hostname: 'server-1' } }],
      relations: [{ type: 'has-finding', from: { type: 'asset', key: 'server-1' }, to: { type: 'finding', key: 'missing' } }],
    })).rejects.toMatchObject({ code: 'RELATION_NOT_FOUND' });
    expect(await storage.getCheckpoint(scope)).toBeNull();
    const rolledBack = await connection.withClient(client => client.query('SELECT count(*) AS count FROM platform_records WHERE plugin_id=$1', [scope.pluginId]));
    expect(rolledBack.rows[0].count).toBe('0');

    await commit(failedRun, scope, {
      processedCount: 2, acceptedCount: 2,
      records: [
        { type: 'asset', key: 'server-1', values: { hostname: 'server-1' } },
        { type: 'finding', key: 'finding-1', values: { severity: 'high' } },
      ],
      relations: [{ type: 'has-finding', from: { type: 'asset', key: 'server-1' }, to: { type: 'finding', key: 'finding-1' } }],
    });
    const nextRun = await start(scope);
    await commit(nextRun, scope, {
      expectedCheckpoint: { offset: 1 }, nextCheckpoint: { offset: 2 },
      records: [], processedCount: 0, acceptedCount: 0,
      relations: [{ type: 'has-finding', from: { type: 'asset', key: 'server-1' }, to: { type: 'finding', key: 'finding-1' } }],
    });
    const relations = await connection.withClient(client => client.query('SELECT count(*) AS count FROM platform_record_relations WHERE plugin_id=$1', [scope.pluginId]));
    expect(relations.rows[0].count).toBe('1');
  });

  it('격리 오류를 checkpoint 전에 저장하고 partial 집계를 남긴다', async () => {
    const scope = testScope('partial');
    const runId = await start(scope);
    await commit(runId, scope, {
      processedCount: 2, acceptedCount: 1,
      issues: [{ sourceIndex: 1, code: 'INVALID_FIELD_TYPE', path: '/records/0', message: 'transform output rejected', keyHint: 'bad-1' }],
    });
    await storage.finishRun({ runId, status: 'partial', finishedAt: '2026-09-11T01:02:00Z' });
    const result = await connection.withClient(client => client.query(`SELECT r.status, r.processed_count, r.accepted_count, r.isolated_count,
      i.batch_start_checkpoint, i.source_index, i.code, i.path, i.message, i.key_hint
      FROM collection_runs r JOIN collection_issues i ON i.run_id=r.id WHERE r.id=$1`, [runId]));
    expect(result.rows[0]).toMatchObject({ status: 'partial', processed_count: '2', accepted_count: '1', isolated_count: '1', batch_start_checkpoint: null, source_index: '1', code: 'INVALID_FIELD_TYPE', key_hint: 'bad-1' });
  });

  it('checkpoint 충돌은 데이터와 실행 집계를 변경하지 않는다', async () => {
    const scope = testScope('checkpoint');
    const runId = await start(scope);
    await commit(runId, scope);
    await expect(commit(runId, scope, {
      expectedCheckpoint: { offset: 0 }, nextCheckpoint: { offset: 2 },
      records: [{ type: 'asset', key: 'server-2', values: { hostname: 'must-rollback' } }],
    })).rejects.toMatchObject({ code: 'CHECKPOINT_CONFLICT' });
    expect(await storage.getCheckpoint(scope)).toEqual({ offset: 1 });
    const result = await connection.withClient(client => client.query(`SELECT r.processed_count,
      (SELECT count(*) FROM platform_records p WHERE p.plugin_id=$2) AS records FROM collection_runs r WHERE r.id=$1`, [runId, scope.pluginId]));
    expect(result.rows[0]).toMatchObject({ processed_count: '1', records: '1' });
  });

  it('완료된 전체 실행은 처음부터 다시 수집하고 실패한 실행은 마지막 checkpoint에서 재개한다', async () => {
    const scope = testScope('full-rerun');
    const firstRun = await start(scope);
    await commit(firstRun, scope);
    await storage.finishRun({ runId: firstRun, status: 'success', finishedAt: '2026-09-11T01:02:00Z' });

    expect(await storage.getCheckpoint(scope)).toBeNull();
    const rerun = await storage.startRun({ ...scope, startedAt: '2026-09-11T02:00:00Z' });
    await commit(rerun, scope, {
      records: [{ type: 'asset', key: 'server-1', values: { hostname: 'rerun' } }],
      nextCheckpoint: { offset: 20 },
    });
    await storage.finishRun({ runId: rerun, status: 'failed', finishedAt: '2026-09-11T02:01:00Z' });

    expect(await storage.getCheckpoint(scope)).toEqual({ offset: 20 });
    const resumed = await storage.startRun({ ...scope, startedAt: '2026-09-11T03:00:00Z' });
    await commit(resumed, scope, {
      expectedCheckpoint: { offset: 20 }, nextCheckpoint: { offset: 40 },
      records: [{ type: 'asset', key: 'server-2', values: { hostname: 'resumed' } }],
    });
    const records = await connection.withClient(client => client.query(
      'SELECT external_key, source_values FROM platform_records WHERE plugin_id=$1 ORDER BY external_key',
      [scope.pluginId],
    ));
    expect(records.rows).toEqual([
      { external_key: 'server-1', source_values: { hostname: 'rerun' } },
      { external_key: 'server-2', source_values: { hostname: 'resumed' } },
    ]);
  });

  it('원천 upsert가 별도 플랫폼 업무 정보를 덮어쓰지 않는다', async () => {
    const scope = testScope('ownership');
    const runId = await start(scope);
    await commit(runId, scope);
    const record = await connection.withClient(client => client.query('SELECT id FROM platform_records WHERE plugin_id=$1', [scope.pluginId]));
    await connection.withClient(async client => {
      await client.query('CREATE TABLE IF NOT EXISTS test_platform_assignments(record_id uuid PRIMARY KEY REFERENCES platform_records(id), assignee text NOT NULL)');
      await client.query('INSERT INTO test_platform_assignments(record_id, assignee) VALUES ($1,$2)', [record.rows[0].id, 'security-team']);
    });
    const nextRun = await start(scope);
    await commit(nextRun, scope, {
      expectedCheckpoint: { offset: 1 }, nextCheckpoint: { offset: 2 },
      records: [{ type: 'asset', key: 'server-1', values: { hostname: 'new-source-value' } }],
    });
    const preserved = await connection.withClient(client => client.query(`SELECT p.id, p.source_values, a.assignee
      FROM platform_records p JOIN test_platform_assignments a ON a.record_id=p.id WHERE p.id=$1`, [record.rows[0].id]));
    expect(preserved.rows[0]).toEqual({ id: record.rows[0].id, source_values: { hostname: 'new-source-value' }, assignee: 'security-team' });
  });

  it('저장 범위만 제한·정렬 조회하고 큰 필드는 목록에서 제외하되 상세에 유지한다', async () => {
    const scope = testScope('query-list');
    const runId = await start(scope);
    const largeBody = 'x'.repeat(8193);
    await commit(runId, scope, { processedCount: 3, acceptedCount: 3, records: [
      { type: 'asset', key: 'old', values: { hostname: 'old' } },
      { type: 'asset', key: 2, values: { hostname: 'new', body: largeBody } },
      { type: 'finding', key: 'ignored-type', values: { title: 'finding' } },
    ] });
    await connection.withClient(client => client.query("UPDATE platform_records SET last_seen_at='2026-09-10T00:00:00Z' WHERE plugin_id=$1 AND external_key='old'", [scope.pluginId]));
    await storage.finishRun({ runId, status: 'success', finishedAt: '2026-09-11T01:02:00Z' });

    const result = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', limit: 20 });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ externalKey: 2, sourceValues: { hostname: 'new' }, omittedFields: ['body'] });
    expect(result.lastStoredAt).toBe('2026-09-11T01:01:00.000Z');
    expect(result.collection).toMatchObject({ scope: 'source', status: 'success', runId });
    const detail = await query.getRecord(result.items[0].id);
    expect(detail.sourceValues).toEqual({ hostname: 'new', body: largeBody });
    expect((await query.listRecords({ pluginId: scope.pluginId, sourceId: 'other', dataType: 'asset' })).items).toEqual([]);

    await connection.withClient(client => client.query(`INSERT INTO platform_records
      (plugin_id, data_type, source_id, external_key_type, external_key, source_values, first_seen_at, last_seen_at)
      SELECT $1, 'asset', $2, 'string', 'bulk-' || value, jsonb_build_object('value', value),
        '2026-09-11T02:00:00Z', '2026-09-11T02:00:00Z' FROM generate_series(1, 205) value`, [scope.pluginId, scope.sourceId]));
    const defaultList = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset' });
    const maximumList = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', limit: 200 });
    expect(defaultList.items).toHaveLength(20); expect(maximumList.items).toHaveLength(200);
    expect(defaultList.items.map(item => item.id)).toEqual([...defaultList.items.map(item => item.id)].sort());
    expect(defaultList.pageInfo).toMatchObject({ hasNextPage: true }); expect(defaultList.pageInfo.nextCursor).toEqual(expect.any(String));

    const visited = []; let cursor;
    do {
      const page = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', limit: 20, ...(cursor ? { cursor } : {}) });
      visited.push(...page.items.map(item => item.id)); cursor = page.pageInfo.nextCursor ?? undefined;
      if (!page.pageInfo.hasNextPage) expect(cursor).toBeUndefined();
    } while (cursor);
    expect(visited).toHaveLength(207); expect(new Set(visited).size).toBe(207);
    expect(defaultList.lastStoredAt).toBe('2026-09-11T02:00:00.000Z');

    const plan = await connection.withClient(client => client.query(`EXPLAIN (COSTS OFF)
      SELECT id FROM platform_records WHERE plugin_id=$1 AND source_id=$2 AND data_type='asset'
      ORDER BY last_seen_at DESC, id ASC LIMIT 21`, [scope.pluginId, scope.sourceId]));
    expect(plan.rows.map(row => row['QUERY PLAN']).join('\n')).toContain('platform_records_cursor_index');
  });

  it('미수집과 running·partial·failed 최신 전체 수집 상태를 구분한다', async () => {
    const empty = testScope('query-state-empty');
    expect((await query.listRecords({ pluginId: empty.pluginId, sourceId: empty.sourceId, dataType: 'asset' })).collection).toEqual({ scope: 'source', status: 'never_collected', runId: null, startedAt: null, finishedAt: null });

    for (const status of ['running', 'partial', 'failed']) {
      const scope = testScope(`query-state-${status}`);
      const runId = await start(scope);
      if (status === 'partial') {
        await commit(runId, scope, { processedCount: 1, acceptedCount: 0, records: [], issues: [{ sourceIndex: 0, code: 'INVALID', path: '/0', message: 'invalid' }] });
        await storage.finishRun({ runId, status, finishedAt: '2026-09-11T01:02:00Z' });
      } else if (status === 'failed') await storage.finishRun({ runId, status, finishedAt: '2026-09-11T01:02:00Z' });
      expect((await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset' })).collection).toMatchObject({ status, runId });
    }
  });

  it('응답 크기 한도에서 cursor로 중단하고 다음 묶음에서 이어 읽는다', async () => {
    const scope = testScope('query-page-bytes');
    await connection.withClient(client => client.query(`INSERT INTO platform_records
      (plugin_id, data_type, source_id, external_key_type, external_key, source_values, first_seen_at, last_seen_at)
      SELECT $1, 'asset', $2, 'string', 'large-' || value,
        jsonb_build_object('a', repeat('x', 8000), 'b', repeat('x', 8000), 'c', repeat('x', 8000), 'd', repeat('x', 8000),
          'e', repeat('x', 8000), 'f', repeat('x', 8000), 'g', repeat('x', 8000), 'h', repeat('x', 8000)),
        '2026-09-11T02:00:00Z', '2026-09-11T02:00:00Z' FROM generate_series(1, 80) value`, [scope.pluginId, scope.sourceId]));
    const first = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', limit: 200 });
    expect(first.items.length).toBeGreaterThan(0); expect(first.items.length).toBeLessThan(80);
    expect(first.pageInfo).toMatchObject({ hasNextPage: true });
    expect(first.items.every(item => Buffer.byteLength(JSON.stringify(item)) <= 64 * 1024)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(first.items))).toBeLessThanOrEqual(4 * 1024 * 1024);
    const second = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', limit: 200, cursor: first.pageInfo.nextCursor });
    expect([...first.items, ...second.items]).toHaveLength(80);
    expect(second.pageInfo).toEqual({ nextCursor: null, hasNextPage: false });
  });

  it('순회 중 경계 앞뒤 변경에도 cursor 경계를 유지한다', async () => {
    const scope = testScope('query-concurrent');
    await connection.withClient(client => client.query(`INSERT INTO platform_records
      (plugin_id, data_type, source_id, external_key_type, external_key, source_values, first_seen_at, last_seen_at)
      SELECT $1, 'asset', $2, 'string', 'row-' || value, jsonb_build_object('value', value),
        '2026-09-11T02:00:00Z', '2026-09-11T02:00:00Z' FROM generate_series(1, 25) value`, [scope.pluginId, scope.sourceId]));
    const first = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', limit: 20 });
    await connection.withClient(client => client.query(`INSERT INTO platform_records
      (plugin_id, data_type, source_id, external_key_type, external_key, source_values, first_seen_at, last_seen_at)
      VALUES ($1, 'asset', $2, 'string', 'newer', '{}', '2026-09-11T03:00:00Z', '2026-09-11T03:00:00Z'),
             ($1, 'asset', $2, 'string', 'older', '{}', '2026-09-11T01:00:00Z', '2026-09-11T01:00:00Z')`, [scope.pluginId, scope.sourceId]));
    const second = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', limit: 20, cursor: first.pageInfo.nextCursor });
    expect(second.items.map(item => item.externalKey)).toContain('older');
    expect(second.items.map(item => item.externalKey)).not.toContain('newer');
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(first.items.length + second.items.length);
    expect(second.lastStoredAt).toBe('2026-09-11T03:00:00.000Z');
  });

  it('원천과 독립적으로 읽고 DB 실패를 민감정보 없는 오류로 변환한다', async () => {
    let sourceCalls = 0;
    const source = async () => { sourceCalls += 1; throw new Error('source unavailable'); };
    void source;
    await query.listRecords({ pluginId: 'no-source-call', sourceId: 'source', dataType: 'asset' });
    expect(sourceCalls).toBe(0);
    const marker = 'sensitive-query-password';
    const failed = createPostgresRecordQuery({ withClient: async () => { throw new Error(marker); } });
    const error = await failed.listRecords({ pluginId: 'p', sourceId: 's', dataType: 'asset' }).catch(value => value);
    expect(error).toMatchObject({ code: 'QUERY_FAILED', message: '플랫폼 데이터 조회에 실패했습니다.' });
    expect(error.message).not.toContain(marker);
  });

  it('조정 실행은 동일 범위 중복을 막고 만료된 실행의 저장을 fencing한다', async () => {
    const scope = testScope('exclusive-run');
    const first = await storage.startRun({ ...scope, startedAt: new Date().toISOString(), exclusive: true });
    await expect(storage.startRun({ ...scope, startedAt: new Date().toISOString(), exclusive: true })).rejects.toMatchObject({ code: 'RUN_ALREADY_ACTIVE' });
    await connection.withClient(client => client.query("UPDATE collection_runs SET heartbeat_at=now() - interval '3 minutes' WHERE id=$1", [first]));
    const second = await storage.startRun({ ...scope, startedAt: new Date().toISOString(), exclusive: true });
    await expect(commit(first, scope)).rejects.toMatchObject({ code: 'RUN_NOT_ACTIVE' });
    await storage.renewRun(second);
    await commit(second, scope);
  });
});
