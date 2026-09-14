import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import type { MenuItem } from '../src/menu';
import { createNavigationState, formatColumnValue, navigationReducer, RecordListView, requestedCursor } from '../src/record-list';
import type { CollectionStatus, ListRecordsResult } from '../src/records';

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
const result = (collection: CollectionStatus['status'], withItems = true): ListRecordsResult => ({
  items: withItems ? [{ id, pluginId: menu.pluginId, sourceId: menu.sourceId, dataType: menu.dataType, externalKey: 'server-1', sourceValues: { hostname: 'server-1', score: 12345.6, enabled: true, observedAt: '2026-09-11T01:00:00.000Z', secret: 'not-visible' }, firstSeenAt: '2026-09-11T01:00:00.000Z', lastSeenAt: '2026-09-11T01:01:00.000Z', omittedFields: ['details'] }] : [],
  pageInfo: { nextCursor: withItems ? 'next' : null, hasNextPage: withItems }, collection: status(collection), lastStoredAt: withItems ? '2026-09-11T01:01:00.000Z' : null,
});
const handlers = { onLimitChange: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn(), onRetry: vi.fn() };
const render = (props: Partial<Parameters<typeof RecordListView>[0]> = {}) => renderToStaticMarkup(<MemoryRouter><RecordListView menu={menu} limit={20} pageIndex={0} loading={false} result={result('success')} error={null} {...handlers} {...props} /></MemoryRouter>);

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

test('첫 묶음에서 현재 위치와 접근 가능한 페이징 컨트롤을 표시한다', () => {
  const html = render();
  expect(html).toContain('aria-label="목록 페이지 탐색"');
  expect(html).toContain('1번째 묶음');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>이전 묶음<\/button>/);
  expect(html).toMatch(/<button[^>]*>다음 묶음<\/button>/);
  for (const limit of [20, 50, 100, 200]) expect(html).toContain(`value="${limit}"`);
});

test('중간과 마지막 묶음에서 이전·다음 상태를 일관되게 표시한다', () => {
  expect(render({ pageIndex: 1 })).not.toMatch(/<button[^>]*disabled=""[^>]*>이전 묶음<\/button>/);
  const last = result('success'); last.pageInfo = { nextCursor: null, hasNextPage: false };
  const html = render({ pageIndex: 2, result: last });
  expect(html).toContain('3번째 묶음');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>다음 묶음<\/button>/);
  expect(html).toContain('마지막 묶음입니다.');
});

test('로딩·빈 결과·조회 실패에서도 탐색 위치를 유지하고 실행 불가능한 이동을 막는다', () => {
  const loading = render({ pageIndex: 1, loading: true });
  expect(loading).toContain('2번째 묶음');
  expect(loading.match(/disabled=""/g)?.length).toBe(3);
  expect(render({ pageIndex: 0, result: result('success', false) })).toContain('1번째 묶음');
  const failed = render({ pageIndex: 1, error: { kind: 'API_ERROR', message: '저장 레코드 조회에 실패했습니다.' } });
  expect(failed).toContain('2번째 묶음');
  expect(failed).toContain('다시 시도');
});

describe('record list cursor navigation', () => {
  test('다음 성공 후 방문 cursor로 이전 묶음을 요청한다', () => {
    let state = createNavigationState('scope');
    state = navigationReducer(state, { type: 'next', cursor: 'cursor-20' });
    expect(state.target).toEqual({ cursor: 'cursor-20', index: 1 });
    state = navigationReducer(state, { type: 'success' });
    expect(state).toMatchObject({ history: [undefined, 'cursor-20'], index: 1, target: null });
    state = navigationReducer(state, { type: 'previous' });
    expect(state.target).toEqual({ cursor: undefined, index: 0 });
    expect(requestedCursor(state)).toBeUndefined();
  });

  test('실패는 성공한 위치와 이력을 유지하고 같은 대상을 재시도할 수 있다', () => {
    let state = createNavigationState('scope');
    state = navigationReducer(state, { type: 'next', cursor: 'cursor-20' });
    state = navigationReducer(state, { type: 'failure' });
    expect(state).toMatchObject({ history: [undefined], index: 0, target: { cursor: 'cursor-20', index: 1 } });
  });

  test('route 또는 묶음 크기 scope 변경은 cursor 이력과 위치를 초기화한다', () => {
    let state = createNavigationState('old');
    state = navigationReducer(state, { type: 'next', cursor: 'cursor-20' });
    state = navigationReducer(state, { type: 'success' });
    state = navigationReducer(state, { type: 'reset', sessionKey: 'new' });
    expect(state).toEqual(createNavigationState('new'));
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
