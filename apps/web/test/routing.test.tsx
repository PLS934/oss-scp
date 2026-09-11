import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, test } from 'vitest';
import App from '../src/App';
import { groupMenus } from '../src/menu';
import { pluginMenus } from '../src/generated/plugin-menu';

const render = (path: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
test('검증된 메뉴를 그룹과 선언 순서대로 표시한다', () => {
  expect([...groupMenus(pluginMenus)].map(([group, entries]) => [group, entries.map(item => item.title)])).toEqual([['보안 관리', ['취약점']], ['자산 관리', ['서버 자산', '저장소']]]);
  const html = render('/'); expect(html.indexOf('취약점')).toBeLessThan(html.indexOf('서버 자산')); expect(html.indexOf('서버 자산')).toBeLessThan(html.indexOf('저장소'));
});
test('직접 경로에서 조회 범위를 복원한다', () => { const html = render('/assets/repositories'); expect(html).toContain('sample2-single-api'); expect(html).toContain('mock-api-sample2'); expect(html).toContain('repository'); expect(html).toContain('aria-current="page"'); });
test('알 수 없는 경로에는 조회 범위를 만들지 않는다', () => { const html = render('/removed-plugin'); expect(html).toContain('페이지를 찾을 수 없습니다'); expect(html).not.toContain('aria-label="조회 범위"'); });
