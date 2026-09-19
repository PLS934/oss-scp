// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthShell } from '../src/auth-shell';
import { AUTH_REQUIRED_EVENT } from '../src/auth-client';

const roots: Array<{ root: ReturnType<typeof createRoot>; node: HTMLDivElement }> = [];
async function render(request: typeof fetch) {
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node); roots.push({ root, node });
  await act(async () => { root.render(<MemoryRouter><AuthShell request={request} menus={[]} /></MemoryRouter>); });
  return node;
}
afterEach(() => { for (const item of roots.splice(0)) { act(() => item.root.unmount()); item.node.remove(); } });
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('인증 bootstrap 화면', () => {
  it('익명 상태에서는 기존 앱 요청 없이 로그인만 표시한다', async () => {
    const request = vi.fn(() => json({ enabled: true, authenticated: false })) as unknown as typeof fetch;
    const node = await render(request);
    expect(node.textContent).toContain('로그인 ID'); expect(node.textContent).not.toContain('서버 연결 확인 중');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('비활성화 상태는 기존 앱을 바로 표시한다', async () => {
    const request = vi.fn(() => json({ enabled: false })) as unknown as typeof fetch;
    const node = await render(request);
    expect(node.textContent).toContain('OSS-SCP'); expect(node.textContent).not.toContain('로그인 ID');
  });
  it('로그인 성공 뒤 세션을 다시 읽고 앱과 로그아웃을 표시한다', async () => {
    const replies = [{ enabled: true, authenticated: false }, {}, { enabled: true, authenticated: true, user: { loginId: 'alice' } }];
    const request = vi.fn(() => json(replies.shift())) as unknown as typeof fetch;
    const node = await render(request);
    const inputs = node.querySelectorAll('input');
    await act(async () => { inputs[0].value = 'alice'; inputs[0].dispatchEvent(new Event('input', { bubbles: true })); inputs[1].value = 'secret'; inputs[1].dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { (node.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(node.textContent).toContain('alice'); expect(node.textContent).toContain('로그아웃');
    expect(request).toHaveBeenCalledWith('/api/v1/auth/login', expect.objectContaining({ method: 'POST' }));
    await act(async () => { (node.querySelector('button') as HTMLButtonElement).click(); });
    expect(node.textContent).toContain('로그인 ID'); expect(node.textContent).not.toContain('alice');
  });
  it('보호 API 401 이벤트 뒤 세션을 재확인하고 앱을 unmount한다', async () => {
    const replies = [{ enabled: true, authenticated: true, user: { loginId: 'alice' } }, { enabled: true, authenticated: false }];
    const request = vi.fn(() => json(replies.shift())) as unknown as typeof fetch;
    const node = await render(request); expect(node.textContent).toContain('alice');
    await act(async () => { window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT)); });
    expect(node.textContent).toContain('로그인 ID'); expect(node.textContent).not.toContain('alice');
  });
});
