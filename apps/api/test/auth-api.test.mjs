import 'reflect-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../dist/app.module.js';
import { AuthSessionManager } from '../dist/auth-session.js';
import { AuthenticationError } from '../dist/ldap-authenticator.js';
import { LoginRateLimiter } from '../dist/login-rate-limit.js';

const secret = 's'.repeat(32);
function memoryRepository(rows = new Map()) {
  return {
    create: async row => { rows.set(row.sessionHash, row); },
    findValid: async (hash, now) => { const row = rows.get(hash); if (!row || row.expiresAt <= now) { rows.delete(hash); return null; } return row; },
    delete: async hash => { rows.delete(hash); },
    deleteExpired: async (now, limit) => { let count = 0; for (const [hash, row] of rows) if (row.expiresAt <= now && count < limit) { rows.delete(hash); count++; } return count; },
  };
}
function runtime(patch = {}) {
  const repository = patch.repository ?? memoryRepository();
  return {
    config: { enabled: true, ldap: {}, session: { secret, ttlSeconds: 600, secure: true } },
    authenticator: patch.authenticator ?? { authenticate: async (loginId, password) => {
      if (password === 'unavailable') throw new AuthenticationError('AUTH_SERVICE_UNAVAILABLE');
      if (password !== 'correct') throw new AuthenticationError('INVALID_CREDENTIALS');
      return { userId: 'user-1', loginId: loginId.trim() };
    } },
    sessions: new AuthSessionManager(repository, secret, 600),
    rateLimiter: patch.rateLimiter ?? new LoginRateLimiter(secret),
  };
}

const apps = [];
async function start(auth, trustedProxyHops = 0) {
  const connection = { checkReady: async () => true, close: async () => undefined };
  const module = await Test.createTestingModule({ imports: [AppModule.register(connection, undefined, undefined, undefined, undefined, undefined, auth)] }).compile();
  const app = module.createNestApplication();
  app.getHttpAdapter().getInstance().set('trust proxy', trustedProxyHops);
  await app.listen(0, '127.0.0.1'); apps.push(app);
  return await app.getUrl();
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe('인증 API와 전역 경계', () => {
  it('health/ready/session은 공개하고 업무 API는 보호한다', async () => {
    const url = await start(runtime());
    expect((await fetch(`${url}/api/v1/health`)).status).toBe(200);
    expect((await fetch(`${url}/api/v1/ready`)).status).toBe(200);
    expect(await (await fetch(`${url}/api/v1/auth/session`)).json()).toEqual({ enabled: true, authenticated: false });
    const protectedResponse = await fetch(`${url}/api/v1/plugin-menus`);
    expect(protectedResponse.status).toBe(401); expect(await protectedResponse.json()).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('로그인, 현재 세션, Origin 검사와 멱등 로그아웃을 처리한다', async () => {
    const url = await start(runtime());
    const login = await fetch(`${url}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url }, body: JSON.stringify({ loginId: 'alice', password: 'correct' }) });
    expect(login.status).toBe(201);
    const setCookie = login.headers.get('set-cookie');
    expect(setCookie).toContain('HttpOnly'); expect(setCookie).toContain('SameSite=Lax'); expect(setCookie).toContain('Secure');
    const cookie = setCookie.split(';')[0];
    expect(await (await fetch(`${url}/api/v1/auth/session`, { headers: { cookie } })).json()).toEqual({ enabled: true, authenticated: true, user: { loginId: 'alice' } });
    expect((await fetch(`${url}/api/v1/plugin-menus`, { headers: { cookie } })).status).toBe(200);
    const rejected = await fetch(`${url}/api/v1/auth/logout`, { method: 'POST', headers: { cookie, origin: 'https://evil.invalid' } });
    expect(rejected.status).toBe(403); expect(await rejected.json()).toMatchObject({ code: 'ORIGIN_REJECTED' });
    const logout = await fetch(`${url}/api/v1/auth/logout`, { method: 'POST', headers: { cookie, origin: url } });
    expect(logout.status).toBe(201); expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await fetch(`${url}/api/v1/plugin-menus`, { headers: { cookie } })).status).toBe(401);
    expect((await fetch(`${url}/api/v1/auth/logout`, { method: 'POST' })).status).toBe(201);
  });

  it('로그인은 동일 출처 JSON 요청만 허용하고 공개 상태 확인은 유지한다', async () => {
    const url = await start(runtime());
    const body = JSON.stringify({ loginId: 'alice', password: 'correct' });
    for (const headers of [
      { 'content-type': 'application/json', origin: 'https://evil.invalid' },
      { 'content-type': 'application/json' },
      { 'content-type': 'application/x-www-form-urlencoded', origin: url },
    ]) {
      const response = await fetch(`${url}/api/v1/auth/login`, { method: 'POST', headers, body });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'ORIGIN_REJECTED' });
    }
    expect((await fetch(`${url}/api/v1/health`)).status).toBe(200);
    expect((await fetch(`${url}/api/v1/ready`)).status).toBe(200);
  });

  it('자격증명 실패, LDAP 장애와 rate limit을 일반화한다', async () => {
    const url = await start(runtime({ rateLimiter: new LoginRateLimiter(secret, 2, 60_000) }));
    const login = password => fetch(`${url}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url }, body: JSON.stringify({ loginId: 'missing', password }) });
    const invalid = await login('wrong'); expect(invalid.status).toBe(401); expect(await invalid.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const unavailable = await login('unavailable'); expect(unavailable.status).toBe(503); expect(JSON.stringify(await unavailable.json())).not.toContain('LDAP');
    const secondInvalid = await login('wrong'); expect(secondInvalid.status).toBe(401);
    const thirdAttempt = await login('wrong'); expect(thirdAttempt.status).toBe(429); expect(thirdAttempt.headers.get('retry-after')).toBeTruthy();
  });

  it('명시한 proxy 홉에서만 전달된 client IP를 rate limit에 사용한다', async () => {
    const seen = [];
    const rateLimiter = {
      check: ip => { seen.push(ip); return null; }, failure: () => null, success: () => undefined,
    };
    const directUrl = await start(runtime({ rateLimiter }), 0);
    const trustedUrl = await start(runtime({ rateLimiter }), 1);
    const options = url => ({ method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.42', origin: url }, body: JSON.stringify({ loginId: 'alice', password: 'correct' }) });
    expect((await fetch(`${directUrl}/api/v1/auth/login`, options(directUrl))).status).toBe(201);
    expect((await fetch(`${trustedUrl}/api/v1/auth/login`, options(trustedUrl))).status).toBe(201);
    expect(seen[0]).toBe('127.0.0.1');
    expect(seen[1]).toBe('198.51.100.42');
  });
});
