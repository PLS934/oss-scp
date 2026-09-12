import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import type { MenuItem } from '../src/menu';
import { formatColumnValue, RecordListView } from '../src/record-list';
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
const handlers = { onLimitChange: vi.fn(), onNext: vi.fn(), onRetry: vi.fn() };
const render = (props: Partial<Parameters<typeof RecordListView>[0]> = {}) => renderToStaticMarkup(<MemoryRouter><RecordListView menu={menu} limit={20} loading={false} result={result('success')} error={null} {...handlers} {...props} /></MemoryRouter>);

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

test('다음 cursor가 있을 때만 다음 이동을 제공한다', () => {
  expect(render()).toContain('다음 묶음');
  const last = result('success'); last.pageInfo = { nextCursor: null, hasNextPage: false };
  const html = render({ result: last }); expect(html).not.toContain('>다음 묶음<'); expect(html).toContain('마지막 묶음입니다.');
});
