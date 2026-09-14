// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import App from '../src/App';
import type { MenuItem } from '../src/menu';

const menus: MenuItem[] = [
  {
    title: '저장소', icon: 'repository', group: '자산 관리', order: 20, path: '/assets/repositories',
    dataType: 'repository', pluginId: 'sample2-single-api', sourceId: 'mock-api-sample2',
    list: { columns: [{ key: 'fullName', label: '저장소 전체 이름', type: 'string' }] },
    detail: { sections: [{ title: '기본', fields: [{ key: 'fullName', label: '저장소 전체 이름', type: 'string' }] }] },
  },
  {
    title: '서버 자산', icon: 'server', group: '자산 관리', order: 10, path: '/assets/servers',
    dataType: 'asset', pluginId: 'sample1-offset-api', sourceId: 'mock-api-sample1',
    list: { columns: [{ key: 'hostname', label: '호스트명', type: 'string' }] },
    detail: { sections: [{ title: '기본', fields: [{ key: 'hostname', label: '호스트명', type: 'string' }] }] },
  },
];

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('사용자 정의 화면 렌더링 실패를 route에 격리하고 다른 메뉴 이동 시 복구한다', async () => {
  const BrokenList = () => { throw new Error('sensitive custom view failure'); };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === '/api/v1/health') return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({
      items: [], pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasNextPage: false },
      collection: { scope: 'source', status: 'never_collected', runId: null, startedAt: null, finishedAt: null }, lastStoredAt: null,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => root.render(<MemoryRouter initialEntries={['/assets/repositories']}>
    <App menus={menus} customViews={{ 'sample2-single-api': { List: BrokenList } }} />
  </MemoryRouter>));

  expect(container.textContent).toContain('사용자 정의 화면을 표시하지 못했습니다.');
  expect(container.textContent).not.toContain('sensitive custom view failure');
  expect(container.querySelector('aside')).not.toBeNull();

  const serverLink = [...container.querySelectorAll('a')].find(link => link.getAttribute('href') === '/assets/servers');
  expect(serverLink).toBeDefined();
  await act(async () => serverLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));

  expect(container.textContent).toContain('아직 수집된 데이터가 없습니다.');
  expect(container.textContent).not.toContain('사용자 정의 화면을 표시하지 못했습니다.');
  await act(async () => root.unmount());
});
