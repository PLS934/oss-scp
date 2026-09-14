import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import type { MenuItem } from '../src/menu';
import { createNavigationState, formatColumnValue, navigationReducer, RecordListView, pageNumbers } from '../src/record-list';
import type { RecordSearchState } from '../src/record-search';
import type { CollectionStatus, NumberedListRecordsResult } from '../src/records';

const menu: MenuItem = {
  title: '서버 자산', icon: 'server', group: '자산 관리', order: 10, path: '/assets/servers',
  pluginId: 'sample1-offset-api', sourceId: 'mock-api-sample1', dataType: 'asset',
  list: { columns: [
    { key: 'hostname', label: '호스트명', type: 'string' },
    { key: 'score', label: '점수', type: 'number' },
    { key: 'enabled', label: '활성', type: 'boolean' },
    { key: 'observedAt', label: '관측 시각', type: 'datetime' },
  ] },
  detail: { sections: [{ title: '기본 정보', fields: [{ key: 'hostname', label: '호스트명', type: 'string' }] }] },
};
const id = '00000000-0000-4000-8000-000000000001';
const status = (value: CollectionStatus['status']): CollectionStatus => ({ scope: 'source', status: value, runId: value === 'never_collected' ? null : id, startedAt: value === 'never_collected' ? null : '2026-09-11T01:00:00.000Z', finishedAt: value === 'running' || value === 'never_collected' ? null : '2026-09-11T01:02:00.000Z' });
const result = (collection: CollectionStatus['status'], withItems = true): NumberedListRecordsResult => ({
  items: withItems ? [{ id, pluginId: menu.pluginId, sourceId: menu.sourceId, dataType: menu.dataType, externalKey: 'server-1', sourceValues: { hostname: 'server-1', score: 12345.6, enabled: true, observedAt: '2026-09-11T01:00:00.000Z', secret: 'not-visible' }, firstSeenAt: '2026-09-11T01:00:00.000Z', lastSeenAt: '2026-09-11T01:01:00.000Z', omittedFields: ['details'] }] : [],
  pageInfo: { page: 1, pageSize: 20, totalItems: withItems ? 45 : 0, totalPages: withItems ? 3 : 0, hasNextPage: withItems }, collection: status(collection), lastStoredAt: withItems ? '2026-09-11T01:01:00.000Z' : null,
});
const handlers = { onLimitChange: vi.fn(), onPageChange: vi.fn(), onRetry: vi.fn() };
const render = (props: Partial<Parameters<typeof RecordListView>[0]> = {}) => renderToStaticMarkup(<MemoryRouter><RecordListView menu={menu} limit={20} page={1} loading={false} result={result('success')} error={null} {...handlers} {...props} /></MemoryRouter>);

describe('record list scalar formatter', () => {
  test('선언 타입만 형식화한다', () => {
    expect(formatColumnValue('string', 'server-1')).toBe('server-1');
    expect(formatColumnValue('number', 12345.6)).toContain('12,345');
    expect(formatColumnValue('boolean', true)).toBe('예');
    expect(formatColumnValue('boolean', false)).toBe('아니요');
    expect(formatColumnValue('datetime', '2026-09-11T01:00:00.000Z')).toMatch(/2026/);
  });
  test.each([null, undefined, { nested: true }, ['value']])('null·누락·중첩 값은 빈 표현으로 처리한다: %o', value => {
    expect(formatColumnValue('string', value as never)).toBe('—');
  });
  test('타입 불일치와 잘못된 날짜를 추정하지 않는다', () => {
    expect(formatColumnValue('number', '123')).toBe('—');
    expect(formatColumnValue('boolean', 1)).toBe('—');
    expect(formatColumnValue('datetime', 'not-a-date')).toBe('—');
  });
});

test('기본 컬럼 순서와 표시명만 렌더링한다', () => {
  const html = render();
  expect(html.indexOf('호스트명')).toBeLessThan(html.indexOf('점수'));
  expect(html).toContain('server-1'); expect(html).toContain('12,345'); expect(html).toContain('예');
  expect(html).not.toContain('secret'); expect(html).not.toContain('not-visible'); expect(html).not.toContain('details');
});

test('필터가 선언된 컬럼명만 필터 버튼으로 렌더링한다', () => {
  const filteredMenu: MenuItem = { ...menu, list: { ...menu.list, query: { searchEnabled: true, filters: [{ key: 'score', label: '점수', type: 'number', kind: 'numberRange' }] } } };
  const searchState: RecordSearchState = { query: filteredMenu.list.query!, q: '', appliedQ: '', draft: {}, error: null, setQ: vi.fn(), update: vi.fn(), clearFilter: vi.fn(), submitSearch: vi.fn(), clearSearch: vi.fn(), reset: vi.fn() };
  const html = render({ menu: filteredMenu, searchState });
  expect(html).toContain('aria-label="점수 필터"');
  expect(html).not.toContain('aria-label="호스트명 필터"');
});

test('목록 레코드의 내부 UUID로 현재 메뉴 상세 링크를 만든다', () => {
  expect(render()).toContain(`href="/assets/servers/${id}"`);
});

test.each([
  ['never_collected', false, '아직 수집된 데이터가 없습니다.'],
  ['success', false, '수집이 완료됐지만 표시할 결과가 없습니다.'],
  ['running', true, '현재 수집이 진행 중입니다.'],
  ['partial', true, '마지막 수집이 부분 완료되었습니다.'],
  ['failed', true, '마지막 수집이 실패했습니다.'],
] as const)('%s 상태를 구분하고 저장 행을 조건에 맞게 유지한다', (collection, withItems, message) => {
  const html = render({ result: result(collection, withItems) });
  expect(html).toContain(message);
  expect(html.includes('server-1')).toBe(withItems);
});

test('로딩과 조회 실패를 안전하게 표시한다', () => {
  expect(render({ loading: true, result: null })).toContain('저장된 목록을 불러오는 중입니다.');
  const html = render({ result: null, error: { kind: 'API_ERROR', message: '저장 레코드 조회에 실패했습니다.' } });
  expect(html).toContain('저장 레코드 조회에 실패했습니다.'); expect(html).toContain('다시 시도');
});

test('첫 페이지에서 번호·전체 건수와 접근 가능한 탐색을 표시한다', () => {
  const html = render();
  expect(html).toContain('aria-label="목록 페이지 탐색"');
  expect(html).toContain('전체 45건');
  expect(html).toMatch(/aria-label="첫 페이지" disabled=""/);
  expect(html).toMatch(/aria-label="이전 페이지" disabled=""/);
  expect(html).toContain('aria-label="1페이지" aria-current="page"');
  expect(html).not.toMatch(/aria-label="다음 페이지" disabled/);
  for (const limit of [20, 50, 100, 200]) expect(html).toContain(`value="${limit}"`);
});

test('마지막 페이지에서는 다음과 마지막 이동을 막는다', () => {
  const last = result('success');
  last.pageInfo = { page: 3, pageSize: 20, totalItems: 45, totalPages: 3, hasNextPage: false };
  const html = render({ page: 3, result: last });
  expect(html).toContain('aria-label="3페이지" aria-current="page"');
  expect(html).toMatch(/aria-label="다음 페이지" disabled=""/);
  expect(html).toMatch(/aria-label="마지막 페이지" disabled=""/);
  expect(html).not.toMatch(/aria-label="이전 페이지" disabled/);
});

test('로딩·빈 결과·조회 실패는 위치와 행을 보존하며 이동을 막는다', () => {
  const loading = render({ page: 2, loading: true });
  expect(loading).toContain('aria-label="2페이지" aria-current="page"');
  expect(loading).toContain('server-1');
  expect(loading.match(/disabled=""/g)?.length).toBe(8);
  const empty = render({ result: result('success', false) });
  expect(empty).toContain('전체 0건');
  expect(empty.match(/disabled=""/g)?.length).toBe(4);
  const failed = render({ page: 2, error: { kind: 'API_ERROR', message: '조회 실패' } });
  expect(failed).toContain('aria-label="2페이지" aria-current="page"');
  expect(failed).toContain('server-1');
  expect(failed).toContain('다시 시도');
});

test.each([
  [1, 0, []], [1, 1, [1]], [1, 12, [1,2,3,4,5,6,7,8,9,10]],
  [10, 21, [1,2,3,4,5,6,7,8,9,10]], [11, 21, [11,12,13,14,15,16,17,18,19,20]], [21,21,[21]],
])('페이지 %i / %i의 번호 구간', (page, total, expected) => {
  expect(pageNumbers(page as number, total as number)).toEqual(expected);
});

describe('numbered navigation state', () => {
  test('임의 이동은 성공 전 위치를 유지하고 서버 보정 page를 반영한다', () => {
    let state = createNavigationState('scope');
    state = navigationReducer(state, { type: 'navigate', page: 15 });
    expect(state).toMatchObject({ page: 1, target: 15 });
    state = navigationReducer(state, { type: 'success', page: 12 });
    expect(state).toMatchObject({ page: 12, target: null });
  });
  test('실패는 마지막 성공 위치와 재시도 대상을 유지한다', () => {
    let state = createNavigationState('scope');
    state = navigationReducer(state, { type: 'navigate', page: 3 });
    state = navigationReducer(state, { type: 'failure' });
    expect(state).toMatchObject({ page: 1, target: 3 });
  });
  test('route 또는 크기가 바뀌면 위치를 초기화한다', () => {
    let state = navigationReducer(createNavigationState('old'), { type: 'success', page: 12 });
    state = navigationReducer(state, { type: 'reset', sessionKey: 'new' });
    expect(state).toEqual(createNavigationState('new'));
  });
  test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('잘못된 페이지 %s를 무시한다', page => {
    const state = createNavigationState('scope');
    expect(navigationReducer(state, { type: 'navigate', page })).toBe(state);
  });
});


test('상세 액션 열 없이 행마다 하나의 식별 가능한 네이티브 링크를 제공한다', () => {
  const html = render();
  expect(html.match(/scope="col"/g)).toHaveLength(menu.list.columns.length);
  expect(html).not.toContain('>상세</th>');
  expect(html).not.toContain('>보기</a>');
  expect(html.match(/<a /g)).toHaveLength(1);
  expect(html).toContain(`aria-label="서버 자산 server-1 (${id}) 상세"`);
  expect(html).toContain('class="record-row"');
});

test('누락되거나 중복된 표시값도 UUID로 상세 대상을 구분한다', () => {
  const data = result('success');
  data.items[0].sourceValues = {};
  const secondId = '00000000-0000-4000-8000-000000000002';
  data.items.push({ ...data.items[0], id: secondId });
  const html = render({ result: data });
  for (const value of [id, secondId]) {
    expect(html).toContain(`aria-label="서버 자산 — (${value}) 상세"`);
    expect(html).toContain(`href="/assets/servers/${value}"`);
  }
  expect(html).not.toContain('server-1');
});

test('저장 행이 없는 로딩·빈 결과·실패에는 상세 링크를 만들지 않는다', () => {
  for (const props of [
    { loading: true, result: null },
    { result: result('success', false) },
    { result: null, error: { kind: 'API_ERROR' as const, message: '조회 실패' } },
  ]) expect(render(props)).not.toContain('<a ');
});

test.each(['never_collected', 'running', 'partial', 'failed', 'success'] as const)('활성 조건의 빈 결과와 %s 수집 상태를 구분한다', collection => {
  const html = render({ result: result(collection, false), activeConditions: true, onClearConditions: vi.fn() });
  expect(html).toContain('검색·필터 결과가 없습니다.');
  expect(html).toContain('조건 초기화');
  if (collection === 'partial') expect(html).toContain('부분 완료');
  if (collection === 'failed') expect(html).toContain('마지막 수집이 실패');
  if (collection === 'running') expect(html).toContain('수집이 진행 중');
  if (collection === 'never_collected') expect(html).toContain('아직 수집된 데이터');
});
