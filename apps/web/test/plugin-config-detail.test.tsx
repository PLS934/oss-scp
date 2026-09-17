// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { PluginConfigDetail, PluginConfigDetailContent } from '../src/plugin-config-detail';
import { loadPluginDetail, PluginDetailNotFoundError, type PluginDetail } from '../src/plugin-details';

const detail: PluginDetail = {
  id: 'sample', name: '샘플', version: '1.2.3', description: '<script>설명</script>', enabled: true,
  source: { type: 'http-json', connection: { id: 'api', baseUrl: 'https://example.test' }, request: { method: 'GET', path: '/items', format: 'json' }, response: { itemsPath: 'rows' }, pagination: { type: 'single' }, limits: { timeoutMs: 1000 } },
  data: { types: { asset: { uniqueKey: 'id', fields: { id: { type: 'string', label: '식별자', required: true }, metadata: { type: 'object', label: '메타', fields: { observedAt: { type: 'datetime', label: '관측 시각' } } }, members: { type: 'array', label: '구성원', items: { type: 'string', label: '이름' } } }, views: { list: { columns: ['id'] }, detail: { sections: [{ title: '기본', fields: ['id'] }] } } } }, relations: { owns: { from: { types: ['asset'] }, to: { types: ['person'] } } } },
  menu: { title: '자산', icon: 'server', group: '관리', order: 1, path: '/assets', dataType: 'asset', list: { columns: [{ key: 'id', label: '식별자', type: 'string' }], query: { searchEnabled: true, filters: [] }, sorts: [] }, detail: { sections: [{ title: '기본', fields: [{ key: 'id', label: '식별자', type: 'string' }] }] } },
  transform: { status: 'available', kind: 'typescript-source', code: '<script>unsafe()</script>\nexport const transform = () => null;' },
};

afterEach(() => vi.unstubAllGlobals());

test.each([
  detail,
  { ...detail, source: { type: 'local-csv', fileName: 'data.csv', batching: { size: 20 }, limits: {} } },
  { ...detail, source: { type: 'http-csv', connection: { id: 'api', baseUrl: 'https://example.test' }, request: { method: 'GET', path: '/data.csv', format: 'csv' }, batching: { size: 20 }, limits: {} } },
  { ...detail, source: { type: 'db-postgres', mode: 'live', persistence: 'none', connection: { id: 'db', host: 'db', port: 5432, database: 'source' }, queries: { list: 'SELECT 1', detail: 'SELECT 1' }, externalKeyColumn: 'id', queryFields: {}, batching: { size: 20 }, limits: {} } },
])('source variant 상세 응답을 검증한다', async response => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
  expect(await loadPluginDetail('sample', { request })).toEqual(response);
  expect(request).toHaveBeenCalledWith('/api/v1/plugins/sample', { signal: undefined });
});

test('404와 잘못된 응답을 구분한다', async () => {
  await expect(loadPluginDetail('missing', { request: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 })) })).rejects.toBeInstanceOf(PluginDetailNotFoundError);
  await expect(loadPluginDetail('sample', { request: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...detail, data: null })) })).rejects.toThrow('plugin_detail_invalid_response');
  await expect(loadPluginDetail('sample', { request: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })) })).rejects.toThrow('plugin_detail_request_failed');
});

test('모든 설정 섹션과 중첩 필드·관계·코드 종류를 안전하게 표시한다', () => {
  const html = renderToStaticMarkup(<MemoryRouter><PluginConfigDetailContent detail={detail} /></MemoryRouter>);
  for (const title of ['기본 정보', '수집 설정', '데이터 구조', '가공 코드', '화면 구성']) expect(html).toContain(title);
  expect(html).toContain('metadata'); expect(html).toContain('observedAt'); expect(html).toContain('items'); expect(html).toContain('asset → person');
  expect(html).toContain('TypeScript 원본'); expect(html).toContain('&lt;script&gt;unsafe()&lt;/script&gt;'); expect(html).not.toContain('<script>');
  const unavailable = renderToStaticMarkup(<MemoryRouter><PluginConfigDetailContent detail={{ ...detail, transform: { status: 'unavailable', reason: '코드를 읽을 수 없습니다.' } }} /></MemoryRouter>);
  expect(unavailable).toContain('코드를 읽을 수 없습니다.'); expect(unavailable).toContain('데이터 구조');
});

test('직접 경로의 성공·not-found·실패 상태를 구분한다', async () => {
  const container = document.createElement('div'); const root = createRoot(container);
  const render = async (id: string, response: Response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await act(async () => root.render(<MemoryRouter initialEntries={[`/plugins/${id}`]} key={id}><Routes><Route path="/plugins/:pluginId" element={<PluginConfigDetail />} /></Routes></MemoryRouter>));
    await act(async () => { await Promise.resolve(); });
    return container.textContent ?? '';
  };
  expect(await render('sample', Response.json(detail))).toContain('샘플');
  expect(await render('missing', new Response('', { status: 404 }))).toContain('플러그인을 찾을 수 없습니다');
  expect(await render('failed', new Response('', { status: 503 }))).toContain('플러그인 설정 조회 실패');
  await act(async () => root.unmount());
});
