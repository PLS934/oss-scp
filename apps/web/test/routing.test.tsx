import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, test } from 'vitest';
import App from '../src/App';
import { groupMenus } from '../src/menu';

const pluginMenus = [
  { title: '취약점', icon: 'shield' as const, group: '보안 관리', order: 10, path: '/vulnerabilities', dataType: 'vulnerability', pluginId: 'vulnerabilities-local-csv', sourceId: 'fixtures/csv/vulnerabilities.csv', list: { columns: [{ key: 'cve', label: 'CVE', type: 'string' as const }] }, detail: { sections: [{ title: '기본', fields: [{ key: 'cve', label: 'CVE', type: 'string' as const }] }] } },
  { title: 'HTTP 취약점', icon: 'shield' as const, group: '보안 관리', order: 20, path: '/vulnerabilities/http', dataType: 'vulnerability', pluginId: 'vulnerabilities-http-csv', sourceId: 'mock-api-vulnerabilities-csv', list: { columns: [{ key: 'cve', label: 'CVE', type: 'string' as const }] }, detail: { sections: [{ title: '기본', fields: [{ key: 'cve', label: 'CVE', type: 'string' as const }] }] } },
  { title: '서버 자산', icon: 'server' as const, group: '자산 관리', order: 10, path: '/assets/servers', dataType: 'asset', pluginId: 'sample1-offset-api', sourceId: 'mock-api-sample1', list: { columns: [{ key: 'hostname', label: '호스트명', type: 'string' as const }] }, detail: { sections: [{ title: '기본', fields: [{ key: 'hostname', label: '호스트명', type: 'string' as const }] }] } },
  { title: '저장소', icon: 'repository' as const, group: '자산 관리', order: 20, path: '/assets/repositories', dataType: 'repository', pluginId: 'sample2-single-api', sourceId: 'mock-api-sample2', list: { columns: [{ key: 'fullName', label: '저장소 전체 이름', type: 'string' as const }] }, detail: { sections: [{ title: '기본', fields: [{ key: 'fullName', label: '저장소 전체 이름', type: 'string' as const }] }] } },
];
const render = (path: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><App menus={pluginMenus} /></MemoryRouter>);
test('검증된 메뉴를 그룹과 선언 순서대로 표시한다', () => {
  expect([...groupMenus(pluginMenus)].map(([group, entries]) => [group, entries.map(item => item.title)])).toEqual([['보안 관리', ['취약점', 'HTTP 취약점']], ['자산 관리', ['서버 자산', '저장소']]]);
  const html = render('/'); expect(html.indexOf('취약점')).toBeLessThan(html.indexOf('서버 자산')); expect(html.indexOf('서버 자산')).toBeLessThan(html.indexOf('저장소'));
});
test('아이콘 렌더러가 없으면 아이콘 영역 없이 메뉴 제목만 표시한다', () => {
  const html = render('/');
  expect(html).toMatch(/href="\/assets\/servers"[^>]*>서버 자산<\/a>/);
  expect(html).toMatch(/href="\/assets\/repositories"[^>]*>저장소<\/a>/);
  expect(html.match(/<nav aria-label="플러그인 메뉴">[\s\S]*?<\/nav>/)?.[0]).not.toContain('aria-hidden="true"');
  expect(html).not.toContain('서버 서버 자산');
  expect(html).not.toContain('저장소 저장소');
});
test('직접 경로에서 해당 플러그인 목록을 복원한다', () => { const html = render('/assets/repositories'); expect(html).toContain('id="record-list-title">저장소'); expect(html).toContain('저장된 목록을 불러오는 중입니다'); expect(html).toContain('aria-current="page"'); });
test('직접 상세 경로에서 같은 플러그인 범위를 복원한다', () => { const html = render('/assets/repositories/00000000-0000-4000-8000-000000000001'); expect(html).toContain('상세 정보를 불러오는 중입니다'); expect(html).toContain('aria-current="page"'); });
test('알 수 없는 경로에는 목록을 만들지 않는다', () => { const html = render('/removed-plugin'); expect(html).toContain('페이지를 찾을 수 없습니다'); expect(html).not.toContain('record-list-title'); });

test.each([
  ['/vulnerabilities', '취약점'],
  ['/vulnerabilities/00000000-0000-4000-8000-000000000001', '취약점'],
  ['/vulnerabilities/http', 'HTTP 취약점'],
  ['/vulnerabilities/http/00000000-0000-4000-8000-000000000001', 'HTTP 취약점'],
])('중첩 메뉴 경로 %s에서 해당 메뉴 하나만 활성화한다', (path, title) => {
  const nav = render(path).match(/<nav aria-label="플러그인 메뉴">[\s\S]*?<\/nav>/)?.[0] ?? '';
  const activeLinks = [...nav.matchAll(/<a\b[^>]*aria-current="page"[^>]*>([^<]*)<\/a>/g)];
  expect(activeLinks.map(match => match[1])).toEqual([title]);
});
