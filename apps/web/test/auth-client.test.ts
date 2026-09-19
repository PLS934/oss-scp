// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { AUTH_REQUIRED_EVENT, authenticatedFetch, loadAuthState, login, LoginError, logout } from '../src/auth-client';

const response = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('인증 API client', () => {
  it('비활성·익명·인증 상태를 검증한다', async () => {
    await expect(loadAuthState(vi.fn(() => response(200, { enabled: false })) as typeof fetch)).resolves.toEqual({ kind: 'disabled' });
    await expect(loadAuthState(vi.fn(() => response(200, { enabled: true, authenticated: false })) as typeof fetch)).resolves.toEqual({ kind: 'anonymous' });
    await expect(loadAuthState(vi.fn(() => response(200, { enabled: true, authenticated: true, user: { loginId: 'alice' } })) as typeof fetch)).resolves.toEqual({ kind: 'authenticated', loginId: 'alice' });
    await expect(loadAuthState(vi.fn(() => response(200, { enabled: true, authenticated: true })) as typeof fetch)).rejects.toThrow('invalid');
  });
  it.each([[401, 'INVALID_CREDENTIALS'], [429, 'TOO_MANY_ATTEMPTS'], [503, 'UNAVAILABLE']] as const)('로그인 %s를 %s로 일반화한다', async (status, kind) => {
    await expect(login('alice', 'secret', vi.fn(() => response(status, {})) as typeof fetch)).rejects.toEqual(new LoginError(kind));
  });
  it('로그인 본문과 로그아웃 method를 제한한다', async () => {
    const request = vi.fn(() => response(200, {})) as unknown as typeof fetch;
    await login('alice', 'secret', request); await logout(request);
    expect(request).toHaveBeenNthCalledWith(1, '/api/v1/auth/login', expect.objectContaining({ method: 'POST', body: JSON.stringify({ loginId: 'alice', password: 'secret' }) }));
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/auth/logout', { method: 'POST' });
  });
  it('보호 API 401을 인증 상실 이벤트로 전달한다', async () => {
    const previous = globalThis.fetch; globalThis.fetch = vi.fn(() => response(401, {})) as typeof fetch;
    const listener = vi.fn(); window.addEventListener(AUTH_REQUIRED_EVENT, listener);
    try { await authenticatedFetch('/api/v1/plugins'); expect(listener).toHaveBeenCalledOnce(); }
    finally { window.removeEventListener(AUTH_REQUIRED_EVENT, listener); globalThis.fetch = previous; }
  });
});
