import { expect } from 'vitest';
import { normalizeRecordConditions } from '../dist/index.js';
export const searchDeclaration = { searchFields: ['name', 'cve'], filters: [
  { key: 'state', type: 'string', kind: 'multiSelect', options: [{ value: 'Open', label: '열림' }, { value: 'closed', label: '닫힘' }, { value: 'Open ', label: '공백' }] },
  { key: 'affected', type: 'boolean', kind: 'select', options: [{ value: true, label: '예' }, { value: false, label: '아니요' }] },
  { key: 'score', type: 'number', kind: 'numberRange' },
  { key: 'date', type: 'datetime', kind: 'dateRange' },
] };
export async function verifySearchContract(storage, query, scope) {
  const data = [
    { name: 'Alpha 한글 %_\\ É', cve: 'CVE-1', state: 'Open', score: 0, affected: false, date: '2024-02-29T00:00:00Z' },
    { name: 'ALPHA', cve: 'CVE-2', state: 'closed', score: 9.5, affected: true, date: '2024-02-29T23:59:59.999999999Z' },
    { name: 'Beta', cve: 'ALPHA', state: 'Open ', score: 10, affected: true, date: '2024-03-01T09:00:00+09:00' },
    { name: 'é alpha  beta', cve: 'other', state: 'open', score: '9.5', affected: 'true', date: '2024-02-30T12:00:00Z' },
    { name: null, cve: null, state: null, score: null, affected: null, date: null },
    { name: 123, cve: {}, state: ['Open'], score: {}, affected: 1, date: 'garbage' },
    { name: 'zone', state: 'Open', score: -1, affected: true, date: '2024-03-01T08:59:59.999+09:00' },
    { name: 'zone', date: '2024-02-28T19:00:00-05:00', score: 1e20 },
    { name: 'invalid', date: '2025-02-29T00:00:00Z' },
    { name: 'invalid', date: '2024-02-29T24:00:00Z' },
    { name: 'invalid', date: '0000-01-01T00:00:00Z' },
    { name: 'invalid', date: ['2024-02-29T00:00:00Z'] },
    { name: 'invalid', date: '2024-02-29T00:00:00' },
    { name: 'valid', date: '0001-01-01T00:00:00Z' },
    { name: 'valid', date: '9999-12-31T23:59:59.999Z' },
    { name: 'invalid', date: '2024-02-29T00:00:00Z\n' },
  ];
  const runId = await storage.startRun({ ...scope, startedAt: '2026-09-14T00:00:00.000Z' });
  const records = data.map((values, key) => ({ type: 'asset', key, values }));
  // 같은 정렬 시각에서 둘 이상의 묶음을 넘는 조건부 결과를 만든다.
  records.push(...Array.from({ length: 45 }, (_, index) => ({ type: 'asset', key: 100 + index, values: { name: 'paged-match', score: index, state: 'Open', large: 'x'.repeat(8193) } })));
  await storage.commitBatch({ runId, scope, observedAt: '2026-09-14T01:00:00.000Z', expectedCheckpoint: null, nextCheckpoint: { offset: records.length }, processedCount: records.length, acceptedCount: records.length, records, relations: [], issues: [] });
  const input = { pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', limit: 20 };
  const find = async (q, filters = []) => {
    const conditions = normalizeRecordConditions(q, filters, searchDeclaration);
    const result = await query.listRecords({ ...input, conditions });
    return result.items.map(item => item.externalKey).sort((a, b) => a - b);
  };
  expect(await find('aLpHa')).toEqual([0, 1, 2, 3]);
  expect(await find('%_\\')).toEqual([0]);
  expect(await find('É')).toEqual([0]);
  expect(await find('é')).toEqual([3]);
  expect(await find('한글')).toEqual([0]);
  expect(await find('alpha  beta')).toEqual([3]);
  expect(await find('123')).toEqual([]);
  expect(await find("' OR 1=1 --")).toEqual([]);
  expect(await find('alpha', [{ field: 'state', kind: 'multiSelect', values: ['Open', 'closed'] }])).toEqual([0, 1]);
  expect(await find('alpha', [{ field: 'state', kind: 'multiSelect', values: ['Open '] }])).toEqual([2]);
  expect(await find('alpha', [{ field: 'affected', kind: 'select', value: true }, { field: 'score', kind: 'numberRange', min: 9.5, max: 9.5 }])).toEqual([1]);
  expect(await find('', [{ field: 'affected', kind: 'select', value: false }])).toEqual([0]);
  expect(await find('alpha', [{ field: 'score', kind: 'numberRange', min: 0, max: 10 }])).toEqual([0, 1, 2]);
  expect(await find('', [{ field: 'score', kind: 'numberRange', min: 1e20, max: 1e20 }])).toEqual([7]);
  expect(await find('', [{ field: 'date', kind: 'dateRange', from: '2024-02-29', to: '2024-02-29' }])).toEqual([0, 1, 6, 7]);
  expect(await find('', [{ field: 'date', kind: 'dateRange', from: '0001-01-01', to: '0001-01-01' }])).toEqual([13]);
  expect(await find('', [{ field: 'date', kind: 'dateRange', from: '9999-12-31', to: '9999-12-31' }])).toEqual([14]);
  expect(await find('', [{ field: 'date', kind: 'dateRange', from: '2024-03-01', to: '2024-03-01' }])).toEqual([2]);
  const conditions = normalizeRecordConditions('paged-match', [], searchDeclaration);
  let cursor;
  const ids = [];
  for (let page = 0; page < 3; page++) {
    const result = await query.listRecords({ ...input, conditions, ...(cursor ? { cursor } : {}) });
    expect(result.items).toHaveLength(page === 2 ? 5 : 20);
    expect(result.items.every(item => item.omittedFields.includes('large') && !('large' in item.sourceValues))).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result.items))).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(result.pageInfo.hasNextPage).toBe(page !== 2);
    expect(result.collection.status).toBe('running');
    expect(result.lastStoredAt).toBe('2026-09-14T01:00:00.000Z');
    ids.push(...result.items.map(item => item.id));
    cursor = result.pageInfo.nextCursor;
  }
  expect(new Set(ids).size).toBe(45);
  expect(cursor).toBeNull();
  const numbered = await query.listRecords({ ...input, conditions, page: 99 });
  expect(numbered.pageInfo).toEqual({ page: 3, pageSize: 20, totalItems: 45, totalPages: 3, hasNextPage: false });
  expect(numbered.items.map(item => item.id)).toEqual(ids.slice(40));
  const empty = await query.listRecords({ ...input, conditions: normalizeRecordConditions('not-present', [], searchDeclaration), page: 2 });
  expect(empty.items).toEqual([]);
  expect(empty.pageInfo).toMatchObject({ page: 1, totalItems: 0, totalPages: 0 });

  // 무조건 첫 묶음 밖의 레코드가 조건부 첫 조회에서 검색된다.
  const first = await query.listRecords(input);
  const outside = records.find(record => !first.items.some(item => item.externalKey === record.key) && record.key >= 100);
  const match = await query.listRecords({ ...input, conditions: normalizeRecordConditions('paged-match', [{ field: 'score', kind: 'numberRange', min: outside.values.score, max: outside.values.score }], searchDeclaration) });
  expect(match.items.map(item => item.externalKey)).toEqual([outside.key]);
}
