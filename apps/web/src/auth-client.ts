export type AuthState =
  | { kind: 'disabled' }
  | { kind: 'anonymous' }
  | { kind: 'authenticated'; loginId: string };

export const AUTH_REQUIRED_EVENT = 'oss-scp-auth-required';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
  return response;
}

export async function loadAuthState(request: typeof fetch = fetch, signal?: AbortSignal): Promise<AuthState> {
  const response = await request('/api/v1/auth/session', { signal });
  if (!response.ok) throw new Error('auth_session_request_failed');
  const body: unknown = await response.json();
  if (!object(body) || typeof body.enabled !== 'boolean') throw new Error('auth_session_invalid_response');
  if (!body.enabled && Object.keys(body).length === 1) return { kind: 'disabled' };
  if (body.enabled && body.authenticated === false) return { kind: 'anonymous' };
  if (body.enabled && body.authenticated === true && object(body.user) && typeof body.user.loginId === 'string' && body.user.loginId.length > 0) return { kind: 'authenticated', loginId: body.user.loginId };
  throw new Error('auth_session_invalid_response');
}

export class LoginError extends Error {
  constructor(readonly kind: 'INVALID_CREDENTIALS' | 'TOO_MANY_ATTEMPTS' | 'UNAVAILABLE') { super(kind); }
}

export async function login(loginId: string, password: string, request: typeof fetch = fetch): Promise<void> {
  const response = await request('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ loginId, password }) });
  if (response.ok) return;
  if (response.status === 401) throw new LoginError('INVALID_CREDENTIALS');
  if (response.status === 429) throw new LoginError('TOO_MANY_ATTEMPTS');
  throw new LoginError('UNAVAILABLE');
}

export async function logout(request: typeof fetch = fetch): Promise<void> {
  const response = await request('/api/v1/auth/logout', { method: 'POST' });
  if (!response.ok) throw new Error('auth_logout_failed');
}
