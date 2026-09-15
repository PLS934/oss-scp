import { describe, expect, it } from 'vitest';
import { createMysqlRecordQuery, numberedPageInfo, summarizeNumberedRecords, createPostgresRecordQuery, encodeRecordCursor, QUERY_LIMITS, QueryError, RECORD_LIST_SORT, summarizeSourceValues, validateListRecordsInput, validateRecordId } from '../dist/index.js';

describe('공통 조회 입력 계약', () => {
  const scope = { pluginId: 'sample', sourceId: 'source', dataType: 'asset' };
  const boundary = { lastSeenAt: '2026-09-11T01:00:00.000Z', id: '00000000-0000-4000-8000-000000000001' };
  it('기본 목록 크기와 허용된 사용자 크기를 정규화한다', () => { expect(validateListRecordsInput(scope).limit).toBe(20); for (const limit of QUERY_LIMITS.allowedListSizes) expect(validateListRecordsInput({ ...scope, limit }).limit).toBe(limit); });
  it.each([0, 1, 19, 21, 201, 1.5, Number.NaN])('허용되지 않은 목록 크기 %s를 거부한다', limit => { expect(() => validateListRecordsInput({ ...scope, limit })).toThrowError(expect.objectContaining({ code: 'INVALID_QUERY' })); });
  it('cursor의 범위·크기·고정 정렬과 마지막 키를 복원한다', () => {
    const cursor = encodeRecordCursor({ ...scope, limit: 20 }, boundary);
    expect(validateListRecordsInput({ ...scope, limit: 20, cursor })).toEqual({ ...scope, limit: 20, boundary });
    expect(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))).toMatchObject({ v: 2, ...scope, limit: 20, sort: RECORD_LIST_SORT, ...boundary });
  });
  it('malformed·버전·범위·크기 불일치 cursor를 구분해 거부한다', () => {
    const cursor = encodeRecordCursor({ ...scope, limit: 20 }, boundary);
    const changedVersion = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')), v: 3 })).toString('base64url');
    for (const input of [{ ...scope, cursor: '%' }, { ...scope, cursor: '' }, { ...scope, cursor: changedVersion }, { ...scope, pluginId: 'other', cursor }, { ...scope, limit: 50, cursor }]) expect(() => validateListRecordsInput(input)).toThrowError(expect.objectContaining({ code: 'INVALID_CURSOR' }));
  });
  it('잘못된 cursor를 DB 접근 전에 거부한다', async () => {
    let calls = 0;
    const query = createPostgresRecordQuery({ withClient: async () => { calls += 1; throw new Error('must not query'); } });
    await expect(query.listRecords({ ...scope, cursor: 'bad' })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    expect(calls).toBe(0);
  });
  it('빈 범위와 잘못된 UUID를 DB 접근 전에 거부한다', () => { expect(() => validateListRecordsInput({ pluginId: '', sourceId: 's', dataType: 'asset' })).toThrowError(QueryError); expect(() => validateRecordId('not-a-uuid')).toThrowError(expect.objectContaining({ code: 'INVALID_QUERY' })); expect(() => validateRecordId(boundary.id)).not.toThrow(); });
  it('개별 8 KiB와 레코드 64 KiB 한도를 결정적으로 적용한다', () => {
    const values = { z: 'x'.repeat(8193), name: 'asset', a: { body: 'x'.repeat(8193) }, ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`field${index}`, 'y'.repeat(8000)])) };
    const result = summarizeSourceValues(values);
    expect(result.sourceValues.name).toBe('asset'); expect(result.omittedFields).toEqual([...result.omittedFields].sort()); expect(result.omittedFields).toContain('a'); expect(result.omittedFields).toContain('z'); expect(Buffer.byteLength(JSON.stringify(result.sourceValues))).toBeLessThanOrEqual(QUERY_LIMITS.summaryRecordBytes);
  });
});


describe('번호형 조회 계약', () => {
  const scope = { pluginId: 'sample', sourceId: 'source', dataType: 'asset' };
  it.each([0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])('잘못된 page %s를 DB 접근 전에 거부한다', async page => {
    for (const create of [createPostgresRecordQuery, createMysqlRecordQuery]) {
      let calls = 0;
      const query = create({ withClient: async () => { calls++; } });
      await expect(query.listRecords({ ...scope, page })).rejects.toMatchObject({ code: 'INVALID_QUERY' });
      expect(calls).toBe(0);
    }
  });
  it('page 기본 크기와 cursor 혼합을 검증한다', () => {
    expect(validateListRecordsInput({ ...scope, page: 2 })).toEqual({ ...scope, page: 2, limit: 20 });
    expect(() => validateListRecordsInput({ ...scope, page: 1, cursor: '' })).toThrowError(expect.objectContaining({ code: 'INVALID_QUERY' }));
    expect(numberedPageInfo('45', 2, 20)).toEqual({ page: 2, pageSize: 20, totalItems: 45, totalPages: 3, hasNextPage: true });
    expect(numberedPageInfo(0, 10, 20)).toEqual({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasNextPage: false });
    expect(numberedPageInfo(45, 10, 20).page).toBe(3);
    for (const count of ['9007199254740992', '-1', 'bad', null, undefined, 1.1]) expect(() => numberedPageInfo(count, 1, 20)).toThrowError(expect.objectContaining({ code: 'QUERY_FAILED' }));
  });
  it('200건 큰 요약의 레코드를 모두 보존하고 생략 metadata 및 예산을 지킨다', () => {
    const values = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, 'x'.repeat(8000)]));
    const records = Array.from({ length: 200 }, (_, i) => ({ ...scope, id: String(i), externalKey: i, sourceValues: { ...values, oversized: 'x'.repeat(9000) }, firstSeenAt: '2026-09-11T01:00:00.000Z', lastSeenAt: '2026-09-11T01:00:00.000Z' }));
    const items = summarizeNumberedRecords(records, 200);
    expect(items.map(item => item.id)).toEqual(records.map(item => item.id));
    expect(Buffer.byteLength(JSON.stringify(items))).toBeLessThanOrEqual(QUERY_LIMITS.summaryPageBytes);
    for (const item of items) {
      expect(item.omittedFields).toEqual([...item.omittedFields].sort());
      expect(item.omittedFields).toContain('oversized');
      expect([...Object.keys(item.sourceValues), ...item.omittedFields].sort()).toEqual(Object.keys(records[0].sourceValues).sort());
    }
    expect(records[0].sourceValues.oversized).toHaveLength(9000);
    const metadataHeavy = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`${i}${'k'.repeat(1000)}`, 'x'.repeat(9000)]));
    expect(() => summarizeNumberedRecords([{ ...records[0], sourceValues: metadataHeavy }], 20)).toThrowError(expect.objectContaining({ code: 'QUERY_FAILED' }));
  });
  for (const [db, create] of [['postgres', createPostgresRecordQuery], ['mysql', createMysqlRecordQuery]]) {
    it(`${db}는 count/items를 읽기 transaction에서 조회하고 오류 시 rollback 후 연결을 반환한다`, async () => {
      const calls = []; let released = 0;
      const connection = { withClient: async work => { try { return await work({ query: async (sql, values) => {
        calls.push({ sql, values });
        if (sql.includes('count(*)')) return db === 'postgres' ? { rows: [{ total: '45' }] } : [[{ total: 45 }]];
        if (sql.startsWith('SELECT id, plugin_id')) throw new Error('secret driver error');
        return db === 'postgres' ? { rows: [] } : [[]];
      } }); } finally { released++; } } };
      await expect(create(connection).listRecords({ ...scope, page: 99 })).rejects.toMatchObject({ code: 'QUERY_FAILED', message: '플랫폼 데이터 조회에 실패했습니다.' });
      expect(calls.map(call => call.sql).join(' ')).toContain('REPEATABLE READ');
      expect(calls.map(call => call.sql).join(' ')).toContain('READ ONLY');
      expect(calls.at(-1).sql).toBe('ROLLBACK');
      expect(calls.find(call => call.sql.startsWith('SELECT id, plugin_id')).values.slice(-2)).toEqual([20, 40]);
      expect(released).toBe(1);
    });
  }
});
