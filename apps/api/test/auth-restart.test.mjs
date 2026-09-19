import 'reflect-metadata';
import { GenericContainer, Wait } from 'testcontainers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import {
  createMysqlAuthSessionRepository, createPostgresAuthSessionRepository, defaultMigrationsDirectory, discoverMigrations,
  mysqlAdapter, postgresAdapter, runMysqlMigrations, runPostgresMigrations,
} from '@oss-scp/platform-db';
import { AppModule } from '../dist/app.module.js';
import { AuthSessionManager } from '../dist/auth-session.js';
import { LoginRateLimiter } from '../dist/login-rate-limit.js';

const secret = 'restart-test-session-secret-value';
const password = 'integration-password';

async function start(connection, repository) {
  const auth = {
    config: { enabled: true, ldap: {}, session: { secret, ttlSeconds: 600, secure: false } },
    authenticator: { authenticate: async loginId => ({ userId: 'stable-user', loginId }) },
    sessions: new AuthSessionManager(repository, secret, 600), rateLimiter: new LoginRateLimiter(secret),
  };
  const module = await Test.createTestingModule({ imports: [AppModule.register(connection, undefined, undefined, undefined, undefined, undefined, auth)] }).compile();
  const app = module.createNestApplication(); await app.listen(0, '127.0.0.1');
  return { app, url: await app.getUrl() };
}

async function verifyRestart(kind) {
  const image = kind === 'postgres' ? 'postgres:17.6-bookworm' : 'mysql:8.4.6';
  const port = kind === 'postgres' ? 5432 : 3306;
  const env = kind === 'postgres'
    ? { POSTGRES_DB: 'oss_scp', POSTGRES_USER: 'oss_scp_app', POSTGRES_PASSWORD: password }
    : { MYSQL_DATABASE: 'oss_scp', MYSQL_USER: 'oss_scp_app', MYSQL_PASSWORD: password, MYSQL_ROOT_PASSWORD: 'root-password' };
  const pattern = kind === 'postgres' ? /database system is ready to accept connections/ : /ready for connections.*port: 3306/i;
  const container = await new GenericContainer(image).withEnvironment(env).withExposedPorts(port).withWaitStrategy(Wait.forLogMessage(pattern, 2)).start();
  const config = { type: kind, host: container.getHost(), port: container.getMappedPort(port), database: 'oss_scp', user: 'oss_scp_app', password, poolMax: 3, connectTimeoutMs: 3000, tls: { mode: 'disable' } };
  const adapter = kind === 'postgres' ? postgresAdapter : mysqlAdapter;
  const createRepository = kind === 'postgres' ? createPostgresAuthSessionRepository : createMysqlAuthSessionRepository;
  const run = kind === 'postgres' ? runPostgresMigrations : runMysqlMigrations;
  let first; let second;
  try {
    const firstConnection = await adapter.connect(config);
    await run(firstConnection, discoverMigrations(defaultMigrationsDirectory(kind)), 5000);
    first = await start(firstConnection, createRepository(firstConnection));
    const login = await fetch(`${first.url}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: first.url }, body: JSON.stringify({ loginId: 'alice', password: 'correct' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    await first.app.close(); first = undefined;

    const secondConnection = await adapter.connect(config);
    second = await start(secondConnection, createRepository(secondConnection));
    expect(await (await fetch(`${second.url}/api/v1/auth/session`, { headers: { cookie } })).json()).toEqual({ enabled: true, authenticated: true, user: { loginId: 'alice' } });
    expect((await fetch(`${second.url}/api/v1/auth/logout`, { method: 'POST', headers: { cookie, origin: second.url } })).status).toBe(201);
    expect(await (await fetch(`${second.url}/api/v1/auth/session`, { headers: { cookie } })).json()).toEqual({ enabled: true, authenticated: false });
  } finally {
    await first?.app.close(); await second?.app.close(); await container.stop();
  }
}

describe('DB 세션 재시작 유지', () => {
  it('PostgreSQL에서 새 Nest 인스턴스가 세션을 복구하고 로그아웃한다', () => verifyRestart('postgres'), 120_000);
  it('MySQL에서 새 Nest 인스턴스가 세션을 복구하고 로그아웃한다', () => verifyRestart('mysql'), 180_000);
});
