import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { PluginHomeContent } from '../src/plugin-home';
import { loadPlugins, type PluginSummary } from '../src/plugins';
import type { MenuItem } from '../src/menu';

const plugin: PluginSummary = { id: 'sample', name: '샘플', enabled: true, sourceType: 'http-json' };
const menu = (title: string, path: string): MenuItem => ({ title, path, pluginId: 'sample', sourceId: 'source', dataType: 'asset', group: '자산', order: 1, icon: 'server', list: { columns: [] }, detail: { sections: [] } });
const menus = [menu('서버', '/servers'), menu('저장소', '/repositories')];
const render = (plugins: PluginSummary[], state: 'success' | 'loading' | 'failure' = 'success', menuState: 'success' | 'loading' | 'failure' = 'success') => renderToStaticMarkup(<MemoryRouter><PluginHomeContent plugins={plugins} state={state} menus={menus} menuState={menuState} /></MemoryRouter>);

test('제목 옆 설정 상세 링크와 메뉴 경로별 데이터 조회 링크를 표시한다', () => {
  const html = render([{ ...plugin, description: '<script>설명</script>' }]);
  expect(html).toContain('플러그인 목록');
  expect(html).toContain('외부 API (JSON)');
  expect(html).toContain('활성화');
  expect(html).toContain('&lt;script&gt;설명&lt;/script&gt;');
  expect(html).toContain('href="/servers"');
  expect(html).toContain('href="/plugins/sample"');
  expect(html).toContain('href="/repositories"');
  expect(html).toContain('aria-label="샘플 설정 상세 보기"');
  expect(html).toContain('title="설정 상세 보기"');
  expect(html).toContain('aria-label="샘플 · 서버 데이터 보기"');
  expect(html).toMatch(/class="plugin-title"><h3>샘플<\/h3><a[^>]*href="\/plugins\/sample"/);
  expect(html).toMatch(/href="\/servers"[^>]*>자산 &gt; 서버<\/a>/);
  expect(html).toMatch(/href="\/repositories"[^>]*>자산 &gt; 저장소<\/a>/);
  expect(html).not.toContain('<dt>메뉴 그룹</dt>');
  expect(html).not.toContain('<dt>메뉴 이름</dt>');
  expect(html.indexOf('class="plugin-menu-paths"')).toBeLessThan(html.indexOf('class="plugin-description"'));
  expect(html).toContain('연결·수집 성공을 의미하지 않습니다');
});

test('선택 설명 누락, 비활성 및 메뉴 없는 플러그인을 처리한다', () => {
  const html = render([{ ...plugin, enabled: false }, { ...plugin, id: 'no-menu', sourceType: 'local-csv' }]);
  expect(html).not.toContain('등록된 설명이 없습니다');
  expect(html).not.toContain('class="plugin-description"');
  expect(html).toContain('비활성화');
  expect(html).toContain('로컬 CSV');
  expect(html).toContain('조회 가능한 메뉴가 없습니다');
  expect(html).toContain('href="/plugins/sample"');
  expect(html).toContain('href="/plugins/no-menu"');
  expect(html).toContain('aria-label="샘플 설정 상세 보기"');
  expect(html).not.toContain('aria-label="샘플 · 서버 데이터 보기"');
});

test('목록과 메뉴의 로딩·실패를 빈 결과와 구분한다', () => {
  expect(render([], 'loading')).toContain('플러그인 목록을 불러오는 중');
  expect(render([], 'failure')).toContain('role="alert"');
  expect(render([])).toContain('등록된 플러그인이 없습니다');
  expect(render([plugin], 'success', 'loading')).toContain('조회 메뉴를 확인하는 중');
  const html = render([plugin], 'success', 'failure');
  expect(html).toContain('조회 메뉴를 불러오지 못했습니다');
  expect(html).toContain('href="/plugins/sample"');
  expect(html).not.toContain('aria-label="샘플 · 서버 데이터 보기"');
});

test('등록 API의 정상 응답과 요청 취소 signal을 사용한다', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json([plugin]));
  const signal = new AbortController().signal;
  expect(await loadPlugins({ request, signal })).toEqual([plugin]);
  expect(request).toHaveBeenCalledWith('/api/v1/plugins', { signal });
});

test.each([{}, [null], [{ ...plugin, enabled: 'false' }], [{ ...plugin, sourceType: 'secret-path' }], [{ ...plugin, description: {} }], [plugin, plugin]])('잘못된 등록 응답을 거부한다: %j', async value => {
  await expect(loadPlugins({ request: vi.fn<typeof fetch>().mockResolvedValue(Response.json(value)) })).rejects.toThrow('plugin_invalid_response');
});

test('등록 API HTTP 오류와 네트워크 오류를 전파한다', async () => {
  await expect(loadPlugins({ request: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })) })).rejects.toThrow('plugin_request_failed');
  await expect(loadPlugins({ request: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')) })).rejects.toThrow('offline');
});


test('API 주소와 CSV 파일명을 표시하고 활성 로컬 CSV만 내려받는다', () => {
  const html = render([
    { ...plugin, endpoint: { url: 'https://example.test/api/assets', method: 'GET' } },
    { ...plugin, id: 'local', sourceType: 'local-csv', fileName: '원본.csv' },
    { ...plugin, id: 'http', sourceType: 'http-csv', fileName: 'remote.csv', endpoint: { url: 'https://example.test/remote.csv', method: 'GET' } },
    { ...plugin, id: 'disabled', sourceType: 'local-csv', fileName: 'disabled.csv', enabled: false },
  ]);
  expect(html).toContain('https://example.test/api/assets');
  expect(html).toContain('GET');
  expect(html).toContain('원본.csv');
  expect(html).toContain('https://example.test/remote.csv');
  expect(html).not.toContain('<span>remote.csv</span>');
  expect(html.match(/<dt>파일명<\/dt>/g)).toHaveLength(2);
  expect(html).toContain('href="/api/v1/plugins/local/source-file"');
  expect(html).not.toContain('현재 등록된 CSV 파일 원본입니다.');
  expect(html).toMatch(/class="plugin-file"><span>원본.csv<\/span><a[^>]*source-file/);
  expect(html.match(/aria-label="원본 내려받기"/g)).toHaveLength(1);
  expect(html).not.toContain('>원본 내려받기<');
});

test.each(['https://user:secret@example.test/api', 'https://example.test/api?token=secret', 'https://example.test/api#secret', 'javascript:alert(1)'])('민감하거나 유효하지 않은 endpoint를 거부한다: %s', async url => {
  await expect(loadPlugins({ request: vi.fn<typeof fetch>().mockResolvedValue(Response.json([{ ...plugin, endpoint: { url, method: 'GET' } }])) })).rejects.toThrow('plugin_invalid_response');
});


test('공백뿐인 설명은 영역을 생략한다', () => {
  expect(render([{ ...plugin, description: '   ' }])).not.toContain('class="plugin-description"');
});
