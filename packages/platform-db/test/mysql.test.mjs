import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GenericContainer, Wait } from 'testcontainers';
import {
  defaultMigrationsDirectory, discoverMigrations, mysqlAdapter, mysqlPoolConfig,
  runMysqlMigrations,
} from '../dist/index.js';

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
    expect(discoverMigrations(defaultMigrationsDirectory('mysql')).map(item => item.version)).toEqual([1]);
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
