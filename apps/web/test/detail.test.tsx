import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DetailContent, DetailValue } from '../src/detail';
import { recordDetailPath, type MenuItem } from '../src/menu';

const menu: MenuItem = {
  title: '저장소', icon: 'repository', group: '자산', order: 10, path: '/repositories', dataType: 'repository', pluginId: 'sample', sourceId: 'source',
  list: { columns: [{ key: 'name', label: '이름', type: 'string' }] },
  detail: { sections: [
    { title: '기본 정보', fields: [{ key: 'name', label: '이름', type: 'string' }, { key: 'active', label: '활성', type: 'boolean' }, { key: 'nullable', label: '비고', type: 'string' }, { key: 'missing', label: '누락', type: 'number' }] },
    { title: '중첩 정보', fields: [{ key: 'details', label: '상세', type: 'object' }, { key: 'members', label: '구성원', type: 'array' }] },
  ] },
};

const record = {
  id: '00000000-0000-4000-8000-000000000001', pluginId: 'sample', sourceId: 'source', dataType: 'repository', externalKey: 'repo-1',
  sourceValues: { name: '<script>unsafe()</script>', active: false, nullable: null, details: { observedAt: '2026-09-11T01:00:00.000Z' }, members: [{ login: 'sally' }], undeclared: 'hidden' },
  firstSeenAt: '2026-09-11T01:00:00.000Z', lastSeenAt: '2026-09-11T01:01:00.000Z',
};

describe('공통 상세 renderer', () => {
  it('정의 순서와 타입 표현을 지키고 선택되지 않은 최상위 값을 숨긴다', () => {
    const html = renderToStaticMarkup(<MemoryRouter><DetailContent menu={menu} record={record} /></MemoryRouter>);
    expect(html.indexOf('기본 정보')).toBeLessThan(html.indexOf('중첩 정보'));
    expect(html).toContain('&lt;script&gt;unsafe()&lt;/script&gt;');
    expect(html).toContain('아니요');
    expect(html).toContain('값 없음');
    expect(html).toContain('필드 누락');
    expect(html).toContain('observedAt');
    expect(html).toContain('sally');
    expect(html).not.toMatch(/undeclared|hidden/);
    expect(html).toContain('href="/repositories"');
  });

  it('잘못된 타입과 빈 배열을 안전한 상태로 표시한다', () => {
    expect(renderToStaticMarkup(<DetailValue field={{ key: 'number', label: '숫자', type: 'number' }} value="1" />)).toContain('표시할 수 없는 값');
    expect(renderToStaticMarkup(<DetailValue field={{ key: 'items', label: '목록', type: 'array' }} value={[]} />)).toContain('항목 없음');
  });

  it('현재 메뉴와 내부 UUID만 상세 경로에 사용한다', () => {
    expect(recordDetailPath(menu.path, record.id)).toBe(`/repositories/${record.id}`);
  });
});
