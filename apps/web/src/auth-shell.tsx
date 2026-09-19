import { FormEvent, useCallback, useEffect, useState } from 'react';
import App from './App';
import type { MenuItem } from './menu';
import { AUTH_REQUIRED_EVENT, loadAuthState, login, LoginError, logout, type AuthState } from './auth-client';

const loginMessages = {
  INVALID_CREDENTIALS: '아이디 또는 비밀번호를 확인해 주세요.',
  TOO_MANY_ATTEMPTS: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  UNAVAILABLE: '인증 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
} as const;

export function AuthShell({ request = fetch, menus }: { request?: typeof fetch; menus?: readonly MenuItem[] }) {
  const [state, setState] = useState<AuthState | 'loading' | 'failure'>('loading');
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { setState(await loadAuthState(request, signal)); }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setState('failure'); }
  }, [request]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  useEffect(() => {
    const required = () => { void refresh(); };
    window.addEventListener(AUTH_REQUIRED_EVENT, required); return () => window.removeEventListener(AUTH_REQUIRED_EVENT, required);
  }, [refresh]);

  if (state === 'loading') return <main className="auth-page"><p role="status">인증 상태 확인 중</p></main>;
  if (state === 'failure') return <main className="auth-page"><section className="login-card"><h1>OSS-SCP</h1><p role="alert">서버 인증 상태를 확인할 수 없습니다.</p><button type="button" onClick={() => { setState('loading'); void refresh(); }}>다시 시도</button></section></main>;
  if (state.kind === 'anonymous') return <LoginScreen request={request} onSuccess={() => refresh()} />;
  return <App menus={menus} authUser={state.kind === 'authenticated' ? state.loginId : undefined} onLogout={state.kind === 'authenticated' ? async () => { await logout(request); setState({ kind: 'anonymous' }); } : undefined} />;
}

function LoginScreen({ request, onSuccess }: { request: typeof fetch; onSuccess: () => Promise<void> }) {
  const [loginId, setLoginId] = useState(''); const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string>(); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(undefined);
    try { await login(loginId, password, request); setPassword(''); await onSuccess(); }
    catch (error) { setPassword(''); setMessage(error instanceof LoginError ? loginMessages[error.kind] : loginMessages.UNAVAILABLE); }
    finally { setBusy(false); }
  };
  return <main className="auth-page"><section className="login-card"><p className="eyebrow">오픈소스 취약점 관리 플랫폼</p><h1>OSS-SCP</h1><form onSubmit={event => void submit(event)}>
    <label htmlFor="login-id">로그인 ID</label><input id="login-id" name="loginId" autoComplete="username" required value={loginId} onChange={event => setLoginId(event.target.value)} />
    <label htmlFor="login-password">비밀번호</label><input id="login-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
    {message ? <p role="alert">{message}</p> : null}<button type="submit" disabled={busy}>{busy ? '로그인 중' : '로그인'}</button>
  </form></section></main>;
}
