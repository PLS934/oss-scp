import { verifySearchContract } from './search-contract.mjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { GenericContainer, Wait } from 'testcontainers';
import {
  createMysqlAuthSessionRepository, createMysqlRecordQuery, createMysqlRecordStorage, defaultMigrationsDirectory, discoverMigrations, mysqlAdapter, mysqlPoolConfig,
  collectionLeaseIdentity, collectionScopeIdentity, recordIdentity, recordQueryScopeIdentity,
  runMysqlMigrations,
} from '../dist/index.js';
import { verifyRecordContract, verifyNumberedSnapshot } from './record-contract.mjs';
import { verifyAuthSessionRepository } from './session-contract.mjs';

const image = 'mysql:8.4.6';
const password = 'integration-password';
let container;
let tlsContainer;
let tlsDir;
let ca;
const config = patch => ({
  type: 'mysql', host: container.getHost(), port: container.getMappedPort(3306),
  database: 'oss_scp', user: 'oss_scp_app', password, poolMax: 3,
  connectTimeoutMs: 1500, tls: { mode: 'disable' }, ...patch,
});

beforeAll(async () => {
  tlsDir = mkdtempSync(join(tmpdir(), 'mysql-tls-'));
  execFileSync('openssl', ['req', '-new', '-x509', '-nodes', '-days', '1', '-subj', '/CN=oss-scp-test-ca', '-keyout', join(tlsDir, 'ca-key.pem'), '-out', join(tlsDir, 'ca.pem')]);
  execFileSync('openssl', ['req', '-new', '-nodes', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-keyout', join(tlsDir, 'server-key.pem'), '-out', join(tlsDir, 'server.csr')]);
  writeFileSync(join(tlsDir, 'extensions.cnf'), 'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n');
  execFileSync('openssl', ['x509', '-req', '-days', '1', '-in', join(tlsDir, 'server.csr'), '-CA', join(tlsDir, 'ca.pem'), '-CAkey', join(tlsDir, 'ca-key.pem'), '-CAcreateserial', '-extfile', join(tlsDir, 'extensions.cnf'), '-out', join(tlsDir, 'server-cert.pem')]);
  ca = readFileSync(join(tlsDir, 'ca.pem'), 'utf8');

  const env = { MYSQL_DATABASE: 'oss_scp', MYSQL_USER: 'oss_scp_app', MYSQL_PASSWORD: password, MYSQL_ROOT_PASSWORD: 'root-test-password' };
  container = await new GenericContainer(image)
    .withEnvironment(env).withExposedPorts(3306)
    .withWaitStrategy(Wait.forLogMessage(/ready for connections.*port: 3306/i, 2)).start();
  tlsContainer = await new GenericContainer(image)
    .withEnvironment(env)
    .withCopyFilesToContainer([
      { source: join(tlsDir, 'ca.pem'), target: '/certs/ca.pem' },
      { source: join(tlsDir, 'server-key.pem'), target: '/certs/server-key.pem' },
      { source: join(tlsDir, 'server-cert.pem'), target: '/certs/server-cert.pem' },
    ])
    .withCommand(['bash', '-c', 'chown mysql:mysql /certs/* && chmod 600 /certs/server-key.pem && exec docker-entrypoint.sh mysqld --require-secure-transport=ON --ssl-ca=/certs/ca.pem --ssl-key=/certs/server-key.pem --ssl-cert=/certs/server-cert.pem'])
    .withExposedPorts(3306).withWaitStrategy(Wait.forLogMessage(/ready for connections.*port: 3306/i, 2)).start();
}, 180_000);

afterAll(async () => {
  await Promise.all([container?.stop(), tlsContainer?.stop()]);
  if (tlsDir) rmSync(tlsDir, { recursive: true, force: true });
});

describe('MySQL 어댑터', () => {
  it('설정을 pool 옵션으로 변환하고 호스트 신원 검증을 강제한다', () => {
    expect(mysqlPoolConfig(config())).toMatchObject({ connectionLimit: 3, connectTimeout: 1500, ssl: undefined });
    expect(mysqlPoolConfig(config({ tls: { mode: 'verify-full', ca: 'PEM' } })).ssl).toEqual({ rejectUnauthorized: true, verifyIdentity: true, ca: 'PEM' });
  });
  it('실제 DB의 준비 상태, 종료 후 작업 거부와 반복 종료를 처리한다', async () => {
    const connection = await mysqlAdapter.connect(config());
    expect(await connection.checkReady()).toBe(true);
    await Promise.all([connection.close(), connection.close()]);
    expect(await connection.checkReady()).toBe(false);
    await expect(connection.withClient(async () => undefined)).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
  });
  it('인증·접속 실패를 고정 오류로 바꾼다', async () => {
    for (const patch of [{ password: 'wrong' }, { port: 1, connectTimeoutMs: 100 }]) {
      await expect(mysqlAdapter.connect(config(patch))).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
    }
  });
  it('TLS CA와 localhost 신원을 검증하고 평문으로 전환하지 않는다', async () => {
    const tlsBase = { host: 'localhost', port: tlsContainer.getMappedPort(3306) };
    const connection = await mysqlAdapter.connect(config({ ...tlsBase, tls: { mode: 'verify-full', ca } }));
    await connection.close();
    await expect(mysqlAdapter.connect(config({ ...tlsBase, tls: { mode: 'verify-full' } }))).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
    await expect(mysqlAdapter.connect(config({ ...tlsBase, host: '127.0.0.1', tls: { mode: 'verify-full', ca } }))).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
  });
});

describe('MySQL migration', () => {
  it('제품별 기본 디렉터리만 선택한다', () => {
    expect(defaultMigrationsDirectory('mysql')).toMatch(/migrations\/mysql$/);
    expect(discoverMigrations(defaultMigrationsDirectory('mysql')).map(item => item.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it('최초 적용·재실행·checksum과 실패 버전 미기록을 검증한다', async () => {
    const connection = await mysqlAdapter.connect(config());
    const one = { version: 201, name: 'create-check', sql: 'CREATE TABLE migration_check_mysql(id integer)', checksum: 'mysql-one' };
    try {
      expect(await runMysqlMigrations(connection, [one], 1500)).toBe(1);
      expect(await runMysqlMigrations(connection, [one], 1500)).toBe(0);
      await expect(runMysqlMigrations(connection, [{ ...one, checksum: 'changed' }], 1500)).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
      const bad = { version: 202, name: 'bad', sql: 'CREATE TABLE partial_mysql(id integer); INVALID SQL', checksum: 'bad' };
      await expect(runMysqlMigrations(connection, [one, bad, { version: 203, name: 'later', sql: 'SELECT 1', checksum: 'later' }], 1500)).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
      const [rows] = await connection.withClient(client => client.query('SELECT version FROM oss_scp_schema_migrations WHERE version IN (202, 203)'));
      expect(rows).toEqual([]);
    } finally { await connection.close(); }
  });
  it('잠금 경합을 제한 시간 오류로 처리한다', async () => {
    const first = await mysqlAdapter.connect(config());
    const second = await mysqlAdapter.connect(config());
    try {
      await first.withClient(async client => {
        await client.query("SELECT GET_LOCK('oss-scp-platform-migrations', 1)");
        await expect(runMysqlMigrations(second, [], 100)).rejects.toMatchObject({ code: 'LOCK_TIMEOUT' });
        await client.query("SELECT RELEASE_LOCK('oss-scp-platform-migrations')");
      });
    } finally { await Promise.all([first.close(), second.close()]); }
  });
  it('기존 중복 active run이 있으면 MySQL uniqueness migration을 비파괴적으로 거부한다', async () => {
    const connection = await mysqlAdapter.connect(config());
    const migrations = discoverMigrations(defaultMigrationsDirectory('mysql'));
    const oldScope = { pluginId: `mysql-migration-duplicate-${randomUUID()}`, sourceId: 'source', scopeType: 'full', scopeKey: '', configRevision: 'rev-1' };
    const newScope = { ...oldScope, configRevision: 'rev-2' };
    try {
      await runMysqlMigrations(connection, migrations.slice(0, -1), 5000);
      for (const scope of [oldScope, newScope]) await connection.withClient(client => client.execute(`INSERT INTO collection_runs
        (id, scope_hash, plugin_id, source_id, scope_type, scope_key, config_revision, started_at, heartbeat_at, coordinated)
        VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),1)`, [
        randomUUID(), collectionScopeIdentity(scope), scope.pluginId, scope.sourceId, scope.scopeType, scope.scopeKey, scope.configRevision,
      ]));
      await expect(runMysqlMigrations(connection, migrations, 5000)).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
      const [evidence] = await connection.withClient(client => client.query(`SELECT
        (SELECT count(*) FROM collection_runs WHERE plugin_id=?) AS runs,
        (SELECT count(*) FROM oss_scp_schema_migrations WHERE version=12) AS migration`, [oldScope.pluginId]));
      expect(Number(evidence[0].runs)).toBe(2);
      expect(Number(evidence[0].migration)).toBe(0);
    } finally {
      await connection.withClient(client => client.execute('DELETE FROM collection_runs WHERE plugin_id=?', [oldScope.pluginId]));
      await connection.close();
    }
  });
  it('CLI가 MySQL을 선택하고 비밀번호를 출력하지 않는다', () => {
    const marker = 'sensitive-mysql-password';
    const failed = spawnSync(process.execPath, ['dist/migrate-cli.js'], { cwd: join(import.meta.dirname, '..'), encoding: 'utf8', env: {
      PLATFORM_DB_TYPE: 'mysql', PLATFORM_DB_HOST: '127.0.0.1', PLATFORM_DB_PORT: '1', PLATFORM_DB_NAME: 'oss_scp', PLATFORM_DB_USER: 'app', PLATFORM_DB_PASSWORD: marker, PLATFORM_DB_TLS_MODE: 'disable', PLATFORM_DB_CONNECT_TIMEOUT_MS: '100',
    } });
    expect(failed.status).not.toBe(0);
    expect(`${failed.stdout}${failed.stderr}`).toContain('플랫폼 DB에 연결할 수 없습니다.');
    expect(`${failed.stdout}${failed.stderr}`).not.toContain(marker);
  });
});

describe('MySQL 공통 레코드 저장·조회 계약', () => {
  let connection;
  let storage;
  let query;

  beforeAll(async () => {
    connection = await mysqlAdapter.connect(config());
    await runMysqlMigrations(connection, discoverMigrations(defaultMigrationsDirectory('mysql')), 5000);
    storage = createMysqlRecordStorage(connection);
    query = createMysqlRecordQuery(connection);
  });
  afterAll(async () => { await connection?.close(); });

  const scopeFor = suffix => ({ pluginId: `mysql-${suffix}-${randomUUID()}`, sourceId: 'source-A', scopeType: 'full', scopeKey: '', configRevision: 'rev-1' });
  const start = (scope, at = '2026-09-11T01:00:00.000Z') => storage.startRun({ ...scope, startedAt: at });
  const commit = (runId, scope, patch = {}) => storage.commitBatch({
    runId, scope, observedAt: '2026-09-11T01:01:00.000Z', expectedCheckpoint: null, nextCheckpoint: { offset: 1 },
    processedCount: 1, acceptedCount: 1, records: [{ type: 'asset', key: 'server-1', values: { hostname: 'old' } }], relations: [], issues: [], ...patch,
  });

  it('count 이후 수집이 추가돼도 번호형 items는 같은 snapshot을 사용한다', async () => {
    await verifyNumberedSnapshot(storage, connection, createMysqlRecordQuery, scopeFor('numbered-snapshot'));
  });

  it('제품 중립 공통 fixture를 통과한다', async () => {
    await verifyRecordContract(storage, query, scopeFor('shared-contract'));
    await verifySearchContract(storage, query, scopeFor('search-contract'));
  });

  it('migration 재실행과 실행·checkpoint 상태 전이를 보존한다', async () => {
    expect(await runMysqlMigrations(connection, discoverMigrations(defaultMigrationsDirectory('mysql')), 5000)).toBe(0);
    const scope = scopeFor('run');
    const runId = await start(scope);
    await commit(runId, scope);
    expect(await storage.getCheckpoint(scope)).toEqual({ offset: 1 });
    await storage.finishRun({ runId, status: 'success', finishedAt: '2026-09-11T01:02:00.000Z' });
    expect(await storage.getCheckpoint(scope)).toBeNull();
    await expect(storage.finishRun({ runId, status: 'success', finishedAt: '2026-09-11T01:03:00.000Z' })).rejects.toMatchObject({ code: 'RUN_NOT_ACTIVE' });
  });

  it('기존 trigger와 scheduled metadata·결과·마지막 성공을 같은 이력에 기록한다', async () => {
    const scope = scopeFor('scheduled-run');
    const scheduledAt = '2026-09-19T13:00:00.000Z';
    const partial = await storage.startRun({
      ...scope, startedAt: '2026-09-19T13:00:01.000Z', exclusive: true,
      trigger: 'scheduled', scheduledAt, scheduleTimezone: 'Asia/Seoul',
    });
    await commit(partial, scope, { acceptedCount: 0, records: [], issues: [{ sourceIndex: 0, code: 'INVALID', path: '/', message: 'invalid' }] });
    await storage.finishRun({ runId: partial, status: 'partial', finishedAt: '2026-09-19T13:01:00.000Z' });
    const [metadata] = await connection.withClient(client => client.query(
      'SELECT `trigger`, scheduled_at, schedule_timezone, status FROM collection_runs WHERE id=?', [partial],
    ));
    expect(metadata[0]).toMatchObject({ trigger: 'scheduled', schedule_timezone: 'Asia/Seoul', status: 'partial' });
    expect(new Date(metadata[0].scheduled_at).toISOString()).toBe(scheduledAt);
    expect(await query.getLastSuccessAt(scope.pluginId, scope.sourceId)).toBeNull();

    const startup = await storage.startRun({ ...scope, startedAt: '2026-09-20T13:00:00.000Z', exclusive: true, trigger: 'startup' });
    await commit(startup, scope, { nextCheckpoint: { offset: 2 } });
    await storage.finishRun({ runId: startup, status: 'success', finishedAt: '2026-09-20T13:01:00.000Z' });
    expect(await query.getLastSuccessAt(scope.pluginId, scope.sourceId)).toBe('2026-09-20T13:01:00.000Z');
  });

  it('키 타입·대소문자·긴 키를 구분하고 재수집 내부 ID를 유지한다', async () => {
    const scope = scopeFor('identity');
    const longKey = '가'.repeat(2048);
    const runId = await start(scope);
    await commit(runId, scope, { processedCount: 4, acceptedCount: 4, records: [
      { type: 'asset', key: 'Key', values: { value: 'upper' } },
      { type: 'asset', key: 'key', values: { value: 'lower' } },
      { type: 'asset', key: 1, values: { value: null } },
      { type: 'asset', key: longKey, values: { nested: { number: 1, datetime: '2026-09-11T01:00:00.000Z' } } },
    ] });
    const [before] = await connection.withClient(client => client.query("SELECT id FROM platform_records WHERE plugin_id=? AND external_key='Key'", [scope.pluginId]));
    await connection.withClient(async client => {
      await client.query('CREATE TABLE IF NOT EXISTS test_mysql_assignments(record_id char(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, assignee varchar(255) NOT NULL, CONSTRAINT test_mysql_assignments_record_fk FOREIGN KEY(record_id) REFERENCES platform_records(id)) ENGINE=InnoDB');
      await client.query('INSERT INTO test_mysql_assignments(record_id, assignee) VALUES (?, ?)', [before[0].id, 'security-team']);
    });
    const next = await storage.startRun({
      ...scope, startedAt: '2026-09-11T02:00:01.000Z', trigger: 'scheduled',
      scheduledAt: '2026-09-11T02:00:00.000Z', scheduleTimezone: 'UTC',
    });
    await commit(next, scope, { expectedCheckpoint: { offset: 1 }, nextCheckpoint: { offset: 2 }, records: [{ type: 'asset', key: 'Key', values: { value: 'updated' } }] });
    const page = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', limit: 20 });
    expect(page.items).toHaveLength(4);
    expect((await query.getRecord(before[0].id))).toMatchObject({ id: before[0].id, sourceValues: { value: 'updated' } });
    const [assignment] = await connection.withClient(client => client.query('SELECT assignee FROM test_mysql_assignments WHERE record_id=?', [before[0].id]));
    expect(assignment[0].assignee).toBe('security-team');
    expect(page.items.map(item => item.externalKey)).toEqual(expect.arrayContaining(['Key', 'key', 1, longKey]));
  });

  it('누락 관계와 checkpoint 충돌에서 묶음 전체를 rollback한다', async () => {
    const scope = scopeFor('rollback');
    const runId = await start(scope);
    await expect(commit(runId, scope, { relations: [{ type: 'has', from: { type: 'asset', key: 'server-1' }, to: { type: 'finding', key: 'missing' } }] })).rejects.toMatchObject({ code: 'RELATION_NOT_FOUND' });
    expect(await storage.getCheckpoint(scope)).toBeNull();
    const [empty] = await connection.withClient(client => client.query('SELECT count(*) AS count FROM platform_records WHERE plugin_id=?', [scope.pluginId]));
    expect(Number(empty[0].count)).toBe(0);
    await commit(runId, scope, { processedCount: 2, acceptedCount: 2, records: [
      { type: 'asset', key: 'server-1', values: { hostname: 'one' } }, { type: 'finding', key: 'finding-1', values: { severity: 'high' } },
    ], relations: [{ type: 'has', from: { type: 'asset', key: 'server-1' }, to: { type: 'finding', key: 'finding-1' } }] });
    await expect(commit(runId, scope, { expectedCheckpoint: { offset: 0 }, nextCheckpoint: { offset: 2 } })).rejects.toMatchObject({ code: 'CHECKPOINT_CONFLICT' });
    expect(await storage.getCheckpoint(scope)).toEqual({ offset: 1 });
  });

  it('완료 재순회와 실패 재개를 구분하고 원천 데이터만 갱신한다', async () => {
    const scope = scopeFor('resume');
    const first = await start(scope);
    await commit(first, scope);
    await storage.finishRun({ runId: first, status: 'success', finishedAt: '2026-09-11T01:02:00.000Z' });
    const rerun = await start(scope, '2026-09-11T02:00:00.000Z');
    await commit(rerun, scope, { nextCheckpoint: { offset: 20 }, records: [{ type: 'asset', key: 'server-1', values: { hostname: 'rerun' } }] });
    await storage.finishRun({ runId: rerun, status: 'failed', finishedAt: '2026-09-11T02:02:00.000Z' });
    expect(await storage.getCheckpoint(scope)).toEqual({ offset: 20 });
    const resumed = await start(scope, '2026-09-11T03:00:00.000Z');
    await commit(resumed, scope, { expectedCheckpoint: { offset: 20 }, nextCheckpoint: { offset: 40 }, records: [{ type: 'asset', key: 'server-2', values: { hostname: 'resumed' } }] });
    expect((await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset' })).items).toHaveLength(2);
  });

  it('동일 시각 keyset의 전체 순회와 마지막 부분 묶음에 중복·누락이 없다', async () => {
    const scope = scopeFor('cursor');
    const runId = await start(scope);
    await commit(runId, scope, { processedCount: 47, acceptedCount: 47, observedAt: '2026-09-11T04:00:00.000Z', records: Array.from({ length: 47 }, (_, index) => ({ type: 'asset', key: `row-${index}`, values: { index, nullable: null, nested: { ok: true } } })) });
    const ids = [];
    let cursor;
    do {
      const page = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', limit: 20, ...(cursor ? { cursor } : {}) });
      ids.push(...page.items.map(item => item.id));
      cursor = page.pageInfo.nextCursor ?? undefined;
      if (!cursor) expect(page.pageInfo.hasNextPage).toBe(false);
    } while (cursor);
    expect(ids).toHaveLength(47);
    expect(new Set(ids).size).toBe(47);
    expect(ids).toEqual([...ids].sort());
    const [plan] = await connection.withClient(client => client.query('EXPLAIN SELECT id FROM platform_records WHERE query_scope_hash=? ORDER BY last_seen_at DESC, id ASC LIMIT 21', [recordQueryScopeIdentity(scope.pluginId, scope.sourceId, 'asset')]));
    expect(plan[0].key).toBe('platform_records_cursor_index');
  });

  it('identity digest 충돌과 DB 오류를 민감정보 없는 오류로 바꾼다', async () => {
    const scope = scopeFor('collision');
    const runId = await start(scope);
    await commit(runId, scope);
    await connection.withClient(client => client.query("UPDATE platform_records SET external_key='different' WHERE identity_hash=?", [recordIdentity(scope.pluginId, scope.sourceId, 'asset', 'server-1')]));
    await expect(commit(runId, scope, { expectedCheckpoint: { offset: 1 }, nextCheckpoint: { offset: 2 } })).rejects.toMatchObject({ code: 'PERSIST_FAILED', message: '플랫폼 데이터 저장에 실패했습니다.' });
    const failed = createMysqlRecordQuery({ withClient: async () => { throw new Error('mysql://secret-password'); } });
    const error = await failed.listRecords({ pluginId: 'p', sourceId: 's', dataType: 'asset' }).catch(value => value);
    expect(error).toMatchObject({ code: 'QUERY_FAILED', message: '플랫폼 데이터 조회에 실패했습니다.' });
    expect(error.message).not.toContain('secret-password');
  });

  it('조정 실행은 동일 범위 중복을 막고 만료된 실행의 저장을 fencing한다', async () => {
    const scope = scopeFor('exclusive-run');
    const first = await storage.startRun({ ...scope, startedAt: new Date().toISOString(), exclusive: true });
    await expect(storage.startRun({ ...scope, startedAt: new Date().toISOString(), exclusive: true })).rejects.toMatchObject({ code: 'RUN_ALREADY_ACTIVE' });
    await connection.withClient(client => client.query("UPDATE collection_runs SET heartbeat_at=UTC_TIMESTAMP(3) - INTERVAL 3 MINUTE WHERE id=?", [first]));
    const second = await storage.startRun({ ...scope, startedAt: new Date().toISOString(), exclusive: true });
    await expect(commit(first, scope)).rejects.toMatchObject({ code: 'RUN_NOT_ACTIVE' });
    await storage.renewRun(second);
    await commit(second, scope);
  });

  it('서로 다른 revision도 동일 MySQL lease를 공유하고 stale revision 저장을 fencing한다', async () => {
    const oldScope = scopeFor('cross-revision-lease');
    const newScope = { ...oldScope, configRevision: 'rev-2' };
    const otherConnection = await mysqlAdapter.connect(config());
    try {
      const otherStorage = createMysqlRecordStorage(otherConnection);
      const oldRun = await storage.startRun({
        ...oldScope, startedAt: '2026-09-20T13:00:01.000Z', exclusive: true, trigger: 'scheduled',
        scheduledAt: '2026-09-20T13:00:00.000Z', scheduleTimezone: 'UTC',
      });
      await expect(otherStorage.startRun({
        ...newScope, startedAt: '2026-09-20T13:00:02.000Z', exclusive: true, trigger: 'scheduled',
        scheduledAt: '2026-09-20T13:00:00.000Z', scheduleTimezone: 'UTC',
      })).rejects.toMatchObject({ code: 'RUN_ALREADY_ACTIVE', activeRunId: oldRun });
      await otherStorage.recordScheduledDuplicate({
        ...newScope, activeRunId: oldRun, scheduledAt: '2026-09-20T13:00:00.000Z',
        scheduleTimezone: 'UTC', observedAt: '2026-09-20T13:00:03.000Z',
      });

      await connection.withClient(client => client.query("UPDATE collection_runs SET heartbeat_at=UTC_TIMESTAMP(3) - INTERVAL 3 MINUTE WHERE id=?", [oldRun]));
      const newRun = await otherStorage.startRun({ ...newScope, startedAt: '2026-09-20T13:04:00.000Z', exclusive: true });
      await otherStorage.commitBatch({
        runId: newRun, scope: newScope, observedAt: '2026-09-20T13:04:01.000Z', expectedCheckpoint: null,
        nextCheckpoint: { offset: 2 }, processedCount: 1, acceptedCount: 1,
        records: [{ type: 'asset', key: 'server-1', values: { hostname: 'new' } }], relations: [], issues: [],
      });
      await expect(commit(oldRun, oldScope)).rejects.toMatchObject({ code: 'RUN_NOT_ACTIVE' });
      const [revisions] = await connection.withClient(client => client.query(
        'SELECT config_revision FROM collection_runs WHERE plugin_id=? ORDER BY config_revision', [oldScope.pluginId],
      ));
      const [records] = await connection.withClient(client => client.query(
        'SELECT source_values FROM platform_records WHERE plugin_id=? AND source_id=? AND external_key=?', [oldScope.pluginId, oldScope.sourceId, 'server-1'],
      ));
      const [references] = await connection.withClient(client => client.query(
        'SELECT count(*) AS count FROM scheduled_collection_references WHERE active_run_id=?', [oldRun],
      ));
      expect(revisions.map(row => row.config_revision)).toEqual(['rev-1', 'rev-2']);
      expect(typeof records[0].source_values === 'string' ? JSON.parse(records[0].source_values) : records[0].source_values).toMatchObject({ hostname: 'new' });
      expect(Number(references[0].count)).toBe(1);
      await otherStorage.finishRun({ runId: newRun, status: 'success', finishedAt: '2026-09-20T13:05:00.000Z' });

      const raceOld = scopeFor('cross-revision-race');
      const raceNew = { ...raceOld, configRevision: 'rev-2' };
      const raced = await Promise.allSettled([
        storage.startRun({ ...raceOld, startedAt: '2026-09-20T14:00:00.000Z', exclusive: true }),
        otherStorage.startRun({ ...raceNew, startedAt: '2026-09-20T14:00:00.000Z', exclusive: true }),
      ]);
      expect(raced.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      const raceRun = raced.find(result => result.status === 'fulfilled').value;
      expect(raced.find(result => result.status === 'rejected').reason).toMatchObject({ code: 'RUN_ALREADY_ACTIVE', activeRunId: raceRun });
      await storage.finishRun({ runId: raceRun, status: 'failed', finishedAt: '2026-09-20T14:01:00.000Z' });
    } finally { await otherConnection.close(); }
  });

  it('legacy revision lock과 새 MySQL lease lock 경합도 DB uniqueness로 한 실행만 허용한다', async () => {
    const oldScope = scopeFor('rolling-lock-race');
    const newScope = { ...oldScope, configRevision: 'rev-2' };
    const legacyConnection = await mysqlAdapter.connect(config());
    const legacyRunId = randomUUID();
    let attempted;
    try {
      await legacyConnection.withClient(async client => {
        const legacyLock = collectionScopeIdentity(oldScope).toString('hex');
        await client.query('SELECT GET_LOCK(?, 1)', [legacyLock]);
        await client.beginTransaction();
        try {
          await client.execute(`INSERT INTO collection_runs
            (id, scope_hash, plugin_id, source_id, scope_type, scope_key, config_revision, started_at, heartbeat_at, coordinated, \`trigger\`)
            VALUES (?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3),1,'startup')`, [
            legacyRunId, collectionScopeIdentity(oldScope), oldScope.pluginId, oldScope.sourceId, oldScope.scopeType, oldScope.scopeKey,
            oldScope.configRevision, new Date('2026-09-20T15:00:00.000Z'),
          ]);
          attempted = storage.startRun({ ...newScope, startedAt: '2026-09-20T15:00:01.000Z', exclusive: true })
            .then(value => ({ value }), error => ({ error }));
          await new Promise(resolve => setTimeout(resolve, 50));
          await client.commit();
        } catch (error) { await client.rollback(); throw error; }
        finally { await client.query('SELECT RELEASE_LOCK(?)', [legacyLock]); }
      });
      const outcome = await attempted;
      expect(outcome.error).toMatchObject({ code: 'RUN_ALREADY_ACTIVE', activeRunId: legacyRunId });
      const [evidence] = await connection.withClient(client => client.query(`SELECT lease_hash FROM collection_runs
        WHERE plugin_id=? AND source_id=? AND scope_type=? AND scope_key=? AND status='running' AND coordinated=1`,
      [oldScope.pluginId, oldScope.sourceId, oldScope.scopeType, oldScope.scopeKey]));
      expect(evidence).toHaveLength(1);
      expect(evidence[0].lease_hash).toEqual(collectionLeaseIdentity(oldScope));
      const [plan] = await connection.withClient(client => client.query(`EXPLAIN SELECT id FROM collection_runs FORCE INDEX (collection_runs_active_lease_index)
        WHERE lease_hash=? AND status='running' AND coordinated=1 AND heartbeat_at > UTC_TIMESTAMP(3) - INTERVAL 2 MINUTE`,
      [collectionLeaseIdentity(oldScope)]));
      expect(plan[0].key).toBe('collection_runs_active_lease_index');
      await storage.finishRun({ runId: legacyRunId, status: 'failed', finishedAt: '2026-09-20T15:01:00.000Z' });
    } finally { await legacyConnection.close(); }
  });

  it('scheduled는 startup·CLI·API와 동일한 MySQL lease를 공유한다', async () => {
    for (const [trigger, extra] of [['startup', {}], ['cli', {}], ['api', { requestId: randomUUID() }]]) {
      const scope = scopeFor(`scheduled-conflict-${trigger}`);
      const scheduled = await storage.startRun({
        ...scope, startedAt: '2026-09-19T13:00:01.000Z', exclusive: true, trigger: 'scheduled',
        scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'Asia/Seoul',
      });
      await expect(storage.startRun({ ...scope, startedAt: '2026-09-19T13:00:02.000Z', exclusive: true, trigger, ...extra }))
        .rejects.toMatchObject({ code: 'RUN_ALREADY_ACTIVE', activeRunId: scheduled });
      await storage.finishRun({ runId: scheduled, status: 'failed', finishedAt: '2026-09-19T13:01:00.000Z' });
    }
  });

  it('scheduled lease loser 참조를 완료된 MySQL run에도 멱등 영속화한다', async () => {
    const scope = scopeFor('scheduled-reference');
    const scheduledAt = '2026-09-20T13:00:00.000Z';
    const activeRunId = await storage.startRun({
      ...scope, startedAt: '2026-09-20T13:00:01.000Z', exclusive: true, trigger: 'scheduled', scheduledAt, scheduleTimezone: 'Asia/Seoul',
    });
    const reference = { ...scope, activeRunId, scheduledAt, scheduleTimezone: 'Asia/Seoul', observedAt: '2026-09-20T13:00:02.000Z' };
    await storage.finishRun({ runId: activeRunId, status: 'failed', finishedAt: '2026-09-20T13:01:00.000Z' });
    await storage.recordScheduledDuplicate(reference);
    await storage.recordScheduledDuplicate(reference);
    await expect(storage.recordScheduledDuplicate({ ...reference, activeRunId: randomUUID() })).rejects.toMatchObject({ code: 'RUN_NOT_FOUND' });
    await expect(storage.recordScheduledDuplicate({ ...reference, sourceId: `${scope.sourceId}-other` })).rejects.toMatchObject({ code: 'RUN_NOT_FOUND' });
    const [rows] = await connection.withClient(client => client.query(`SELECT r.active_run_id, r.scheduled_at, r.schedule_timezone, c.plugin_id
      FROM scheduled_collection_references r JOIN collection_runs c ON c.id=r.active_run_id WHERE r.active_run_id=?`, [activeRunId]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ active_run_id: activeRunId, schedule_timezone: 'Asia/Seoul', plugin_id: scope.pluginId });
    expect(new Date(rows[0].scheduled_at).toISOString()).toBe(scheduledAt);
  });
});

describe('MySQL 인증 세션 계약', () => {
  it('생성·유효 조회·만료·삭제·제한 정리를 지원한다', async () => {
    const connection = await mysqlAdapter.connect(config());
    try {
      await runMysqlMigrations(connection, discoverMigrations(defaultMigrationsDirectory('mysql')), 5000);
      await verifyAuthSessionRepository(createMysqlAuthSessionRepository(connection), 'e');
    } finally { await connection.close(); }
  });
});
