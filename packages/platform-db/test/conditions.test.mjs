import { expect, test } from 'vitest';
import { normalizeRecordConditions, validateListRecordsInput, encodeRecordCursor } from '../dist/index.js';
const declaration = { searchFields: ['name', 'cve'], filters: [
  { key: 'state', type: 'string', kind: 'multiSelect', options: [{ value: 'Open', label: '열림' }, { value: 'closed', label: '닫힘' }] },
  { key: 'affected', type: 'boolean', kind: 'select', options: [{ value: true, label: '예' }, { value: false, label: '아니요' }] },
  { key: 'score', type: 'number', kind: 'numberRange' }, { key: 'date', type: 'datetime', kind: 'dateRange' },
] };
const normalize = (q, filters) => normalizeRecordConditions(q, filters, declaration);
const scope = { pluginId: 'p', sourceId: 's', dataType: 'v', limit: 20 };
const boundary = { lastSeenAt: '2026-09-14T00:00:00.000Z', id: '11111111-1111-4111-8111-111111111111' };
test('검색은 ASCII만 접고 내부 공백과 리터럴 문자를 보존한다', () => {
  expect(normalize('  A  É한%_\\  ', []).q).toBe('a  É한%_\\');
  expect(normalize('   ', []).q).toBe('');
  expect(normalize('😀'.repeat(200), []).q.length).toBe(400);
});
test('빈 조건 제거와 필터 순서·중복 정규화로 동일한 지문을 만든다', () => {
  const a = normalize('ABC', [{ field: 'state', kind: 'multiSelect', values: ['Open', 'closed', 'Open'] }, { field: 'score', kind: 'numberRange', min: 0 }]);
  const b = normalize(' abc ', [{ field: 'score', kind: 'numberRange', min: 0 }, { field: 'state', kind: 'multiSelect', values: ['closed', 'Open'] }]);
  expect(a.fingerprint).toBe(b.fingerprint);
  expect(normalize('', [{ field: 'state', kind: 'multiSelect', values: [] }, { field: 'score', kind: 'numberRange' }, { field: 'date', kind: 'dateRange' }]).filters).toEqual([]);
  expect(normalize('', [{ field: 'affected', kind: 'select', value: false }]).filters[0].value).toBe(false);
});
test.each([
  ['a'.repeat(201), []], [' '.repeat(201), []], [['q'], []], ['\0', []],
  ['', '['], ['', '{}'], ['', ' '.repeat(4097)], ['', Array(21).fill({})],
  ['', [{ field: 'unknown', kind: 'numberRange' }]],
  ['', [{ field: 'score', kind: 'numberRange', min: 1, max: 0 }]],
  ['', [{ field: 'score', kind: 'numberRange', min: '1' }]],
  ['', [{ field: 'score', kind: 'numberRange', min: Infinity }]],
  ['', [{ field: 'score', kind: 'numberRange', value: 1 }]],
  ['', [{ field: 'state', kind: 'multiSelect', values: ['open'] }]],
  ['', [{ field: 'state', kind: 'multiSelect', values: Array(101).fill('Open') }]],
  ['', [{ field: 'affected', kind: 'select', value: 'false' }]],
  ['', [{ field: 'affected', kind: 'select' }]],
  ['', [{ field: 'date', kind: 'dateRange', from: '2025-02-29' }]],
  ['', [{ field: 'date', kind: 'dateRange', from: '0000-01-01' }]],
  ['', [{ field: 'date', kind: 'dateRange', from: '2026-09-15', to: '2026-09-14' }]],
  ['', [{ field: 'date', kind: 'dateRange', from: '2026-09-14T00:00:00Z' }]],
  ['', [{ field: 'score', kind: 'numberRange' }, { field: 'score', kind: 'numberRange' }]],
])('유효하지 않은 조건을 거부한다 (%#)', (q, filters) => { expect(() => normalize(q, filters)).toThrow('조회 입력'); });
test('검색 미지원 범위에서 활성 검색만 거부한다', () => {
  expect(() => normalizeRecordConditions('x', [])).toThrow('조회 입력');
  expect(normalizeRecordConditions(' ', '[]').filters).toEqual([]);
});
test('윤년과 양쪽 열린 범위를 허용한다', () => {
  expect(normalize('', [{ field: 'date', kind: 'dateRange', from: '2024-02-29' }]).filters).toHaveLength(1);
  expect(normalize('', [{ field: 'date', kind: 'dateRange', to: '9999-12-31' }]).filters).toHaveLength(1);
});
test('v2 cursor는 조건·선언을 검증하고 v1은 무조건 조회에서만 허용한다', () => {
  const conditions = normalize('A', []);
  const cursor = encodeRecordCursor({ ...scope, conditions }, boundary);
  expect(validateListRecordsInput({ ...scope, conditions: normalize('a ', []), cursor }).boundary).toEqual(boundary);
  expect(() => validateListRecordsInput({ ...scope, conditions: normalize('b', []), cursor })).toThrow('cursor');
  const changed = normalizeRecordConditions('a', [], { ...declaration, searchFields: ['name'] });
  expect(() => validateListRecordsInput({ ...scope, conditions: changed, cursor })).toThrow('cursor');
  const old = Buffer.from(JSON.stringify({ v: 1, ...scope, sort: 'lastSeenAt-desc-id-asc', ...boundary })).toString('base64url');
  expect(validateListRecordsInput({ ...scope, cursor: old }).boundary).toEqual(boundary);
  expect(() => validateListRecordsInput({ ...scope, cursor: old, conditions })).toThrow('cursor');
  expect(() => validateListRecordsInput({ ...scope, cursor: 'a'.repeat(4097) })).toThrow('cursor');
});
