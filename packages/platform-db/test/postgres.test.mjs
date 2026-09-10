import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GenericContainer, Wait } from 'testcontainers';
import { spawnSync } from 'node:child_process';
import {
  discoverMigrations, MigrationError,
  postgresAdapter, postgresPoolConfig, runMigrations,
} from '../dist/index.js';

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
