import { describe, expect, it } from 'vitest';
import { AuthSessionManager, expiredSessionCookie, parseSessionCookie, sessionCookie, sessionHash } from '../dist/auth-session.js';
import { LoginRateLimiter } from '../dist/login-rate-limit.js';

describe('세션 값과 쿠키', () => {
  it('원본을 HMAC하고 32-byte session ID만 쿠키로 전달한다', async () => {
    const rows = new Map();
    const repository = {
      create: async row => { rows.set(row.sessionHash, row); }, findValid: async hash => rows.get(hash) ?? null,
      delete: async hash => { rows.delete(hash); }, deleteExpired: async () => 0,
    };
    const manager = new AuthSessionManager(repository, 's'.repeat(32), 600);
    const created = await manager.create({ userId: 'user', loginId: 'alice' }, new Date('2026-09-19T00:00:00Z'));
    expect(created.sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([...rows.keys()]).toEqual([sessionHash('s'.repeat(32), created.sessionId)]);
    expect(JSON.stringify([...rows.values()])).not.toContain(created.sessionId);
    expect(await manager.find(created.sessionId)).toMatchObject({ loginId: 'alice' });
    await manager.revoke(created.sessionId); expect(await manager.find(created.sessionId)).toBeNull();
  });
  it('쿠키 속성과 strict parsing을 적용한다', () => {
    expect(sessionCookie('a'.repeat(43), 600, false)).toBe(`oss_scp_session=${'a'.repeat(43)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
    expect(sessionCookie('a'.repeat(43), 600, true)).toContain('; Secure');
    expect(expiredSessionCookie(true)).toContain('Max-Age=0');
    expect(parseSessionCookie(`other=x; oss_scp_session=${'a'.repeat(43)}`)).toBe('a'.repeat(43));
    for (const value of [undefined, 'oss_scp_session=short', `oss_scp_session=${'a'.repeat(43)}; oss_scp_session=${'b'.repeat(43)}`]) expect(parseSessionCookie(value)).toBeNull();
  });
});

describe('로그인 rate limit', () => {
  it('실패만 IP와 HMAC login key에 기록하고 성공·만료를 처리한다', () => {
    const limiter = new LoginRateLimiter('s'.repeat(32), 2, 1000);
    expect(limiter.check('1.2.3.4', 'Alice', 0)).toBeNull();
    expect(limiter.check('1.2.3.4', 'Alice', 1)).toBeNull();
    expect(limiter.keys()).toEqual([]);
    expect(limiter.failure('1.2.3.4', 'Alice', 2)).toBeNull();
    expect(limiter.failure('1.2.3.4', 'alice', 3)).toBeNull();
    expect(limiter.check('1.2.3.4', 'alice', 4)).toBe(1);
    expect(limiter.keys().join(' ')).not.toContain('alice');
    limiter.success('ALICE');
    expect(limiter.check('5.6.7.8', 'alice', 3)).toBeNull();
    expect(limiter.check('1.2.3.4', 'other', 1003)).toBeNull();
  });
  it('IP 차단 시 새 login bucket을 만들지 않고 전체 bucket 수를 제한한다', () => {
    const limiter = new LoginRateLimiter('s'.repeat(32), 1, 60_000, 4);
    limiter.failure('1.2.3.4', 'first', 0);
    const beforeBlockedProbe = limiter.keys();
    expect(limiter.check('1.2.3.4', 'never-created', 1)).toBe(60);
    expect(limiter.keys()).toEqual(beforeBlockedProbe);

    for (let index = 0; index < 20; index += 1) limiter.failure(`10.0.0.${index}`, `user-${index}`, 2);
    expect(limiter.keys()).toHaveLength(4);
    expect(limiter.check('203.0.113.10', 'new-user', 3)).toBe(60);
    expect(limiter.check('203.0.113.10', 'new-user', 60_002)).toBeNull();
  });
});
