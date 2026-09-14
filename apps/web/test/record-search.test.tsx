import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { RecordSearch, buildSearchConditions, dateRangeSummary, filterDraftKey, numberRangeSummary, type FilterDraft } from '../src/record-search';
import type { ListQuery } from '../src/menu';
const encodeDraft = (draft: FilterDraft): FilterDraft => Object.fromEntries(Object.entries(draft).map(([key, value]) => { const [field, part = 'value'] = key.split(':'); return [filterDraftKey(field!, part), value]; }));
const query: ListQuery = { searchEnabled: true, filters: [
  { key: 'enabled', label: '영향', type: 'boolean', kind: 'select', options: [{ value: false, label: '아니요' }, { value: true, label: '예' }] },
  { key: 'state', label: '상태', type: 'string', kind: 'multiSelect', options: [{ value: 'open', label: '열림' }, { value: 'closed', label: '닫힘' }] },
  { key: 'score', label: '점수', type: 'number', kind: 'numberRange' },
  { key: 'date', label: '관측일', type: 'datetime', kind: 'dateRange' },
] };
test('선언된 입력과 UTC 기준, 적용·초기화를 표시한다', () => {
  const html = renderToStaticMarkup(<RecordSearch query={query} onApply={vi.fn()} />);
  expect(html).toContain('type="search"'); expect(html).toContain('multiple=""'); expect(html).toContain('UTC'); expect(html).toContain('적용'); expect(html).toContain('초기화');
  const empty = renderToStaticMarkup(<RecordSearch query={{ searchEnabled: false, filters: [] }} onApply={vi.fn()} />);
  expect(empty).not.toContain('<input'); expect(empty).not.toContain('<select');
});
test('선택값 타입과 범위를 보존하며 빈 입력을 제거한다', () => {
  expect(buildSearchConditions(query, '  한글 %_\\  ', encodeDraft({ enabled: '0', state: ['0', '1'], 'score:start': '0', 'score:end': '9.5', 'date:end': '2024-02-29' }))).toEqual({ q: '한글 %_\\', filters: [
    { field: 'enabled', kind: 'select', value: false },
    { field: 'state', kind: 'multiSelect', values: ['open', 'closed'] },
    { field: 'score', kind: 'numberRange', min: 0, max: 9.5 },
    { field: 'date', kind: 'dateRange', to: '2024-02-29' },
  ] });
  expect(buildSearchConditions(query, ' ', encodeDraft({ enabled: '', state: [], 'score:start': '' }))).toEqual({});
});
test('날짜 범위 배지는 양쪽 및 한쪽 날짜를 요약한다', () => {
  expect(dateRangeSummary('1999-09-01', '2000-09-01')).toBe('1999.09.01 ~ 2000.09.01');
  expect(dateRangeSummary('1999-09-01', '')).toBe('1999.09.01 이후');
  expect(dateRangeSummary('', '2000-09-01')).toBe('2000.09.01 이전');
  expect(dateRangeSummary('', '')).toBe('');
});
test('숫자 범위 배지는 양쪽 및 한쪽 값을 요약한다', () => {
  expect(numberRangeSummary('9', '10')).toBe('9 ~ 10');
  expect(numberRangeSummary('9', '')).toBe('9 이상');
  expect(numberRangeSummary('', '10')).toBe('10 이하');
  expect(numberRangeSummary('', '')).toBe('');
});
test.each([
  { 'score:start': '10', 'score:end': '1' },
  { 'score:start': 'Infinity' },
  { 'score:start': 'bad' },
  { 'date:start': '2025-02-29' },
  { 'date:start': '2024-03-01', 'date:end': '2024-02-29' },
  { 'date:start': '0000-01-01' },
])('잘못된 범위를 적용 전에 거부한다 (%#)', draft => {
  expect(() => buildSearchConditions(query, '', encodeDraft(draft))).toThrow();
});
