import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, test } from 'vitest';
import App from '../src/App';
import { groupMenus } from '../src/menu';

const pluginMenus = [
  { title: '취약점', icon: 'shield' as const, group: '보안 관리', order: 10, path: '/vulnerabilities', dataType: 'vulnerability', pluginId: 'vulnerabilities-local-csv', sourceId: 'fixtures/csv/vulnerabilities.csv', list: { columns: [{ key: 'cve', label: 'CVE', type: 'string' as const }] } },
  { title: 'HTTP 취약점', icon: 'shield' as const, group: '보안 관리', order: 20, path: '/vulnerabilities/http', dataType: 'vulnerability', pluginId: 'vulnerabilities-http-csv', sourceId: 'mock-api-vulnerabilities-csv', list: { columns: [{ key: 'cve', label: 'CVE', type: 'string' as const }] } },
  { title: '서버 자산', icon: 'server' as const, group: '자산 관리', order: 10, path: '/assets/servers', dataType: 'asset', pluginId: 'sample1-offset-api', sourceId: 'mock-api-sample1', list: { columns: [{ key: 'hostname', label: '호스트명', type: 'string' as const }] } },
  { title: '저장소', icon: 'repository' as const, group: '자산 관리', order: 20, path: '/assets/repositories', dataType: 'repository', pluginId: 'sample2-single-api', sourceId: 'mock-api-sample2', list: { columns: [{ key: 'fullName', label: '저장소 전체 이름', type: 'string' as const }] } },
];
const render = (path: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><App menus={pluginMenus} /></MemoryRouter>);
test('검증된 메뉴를 그룹과 선언 순서대로 표시한다', () => {
  expect([...groupMenus(pluginMenus)].map(([group, entries]) => [group, entries.map(item => item.title)])).toEqual([['보안 관리', ['취약점', 'HTTP 취약점']], ['자산 관리', ['서버 자산', '저장소']]]);
  const html = render('/'); expect(html.indexOf('취약점')).toBeLessThan(html.indexOf('서버 자산')); expect(html.indexOf('서버 자산')).toBeLessThan(html.indexOf('저장소'));
});
test('직접 경로에서 조회 범위를 복원한다', () => { const html = render('/assets/repositories'); expect(html).toContain('sample2-single-api'); expect(html).toContain('mock-api-sample2'); expect(html).toContain('repository'); expect(html).toContain('aria-current="page"'); });
test('알 수 없는 경로에는 조회 범위를 만들지 않는다', () => { const html = render('/removed-plugin'); expect(html).toContain('페이지를 찾을 수 없습니다'); expect(html).not.toContain('aria-label="조회 범위"'); });
