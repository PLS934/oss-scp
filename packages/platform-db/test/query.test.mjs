import { describe, expect, it } from 'vitest';
import { createPostgresRecordQuery, encodeRecordCursor, QUERY_LIMITS, QueryError, RECORD_LIST_SORT, summarizeSourceValues, validateListRecordsInput, validateRecordId } from '../dist/index.js';

describe('공통 조회 입력 계약', () => {
  const scope = { pluginId: 'sample', sourceId: 'source', dataType: 'asset' };
  const boundary = { lastSeenAt: '2026-09-11T01:00:00.000Z', id: '00000000-0000-4000-8000-000000000001' };
  it('기본 목록 크기와 허용된 사용자 크기를 정규화한다', () => { expect(validateListRecordsInput(scope).limit).toBe(20); for (const limit of QUERY_LIMITS.allowedListSizes) expect(validateListRecordsInput({ ...scope, limit }).limit).toBe(limit); });
  it.each([0, 1, 19, 21, 201, 1.5, Number.NaN])('허용되지 않은 목록 크기 %s를 거부한다', limit => { expect(() => validateListRecordsInput({ ...scope, limit })).toThrowError(expect.objectContaining({ code: 'INVALID_QUERY' })); });
  it('cursor의 범위·크기·고정 정렬과 마지막 키를 복원한다', () => {
    const cursor = encodeRecordCursor({ ...scope, limit: 20 }, boundary);
    expect(validateListRecordsInput({ ...scope, limit: 20, cursor })).toEqual({ ...scope, limit: 20, boundary });
    expect(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))).toMatchObject({ v: 1, ...scope, limit: 20, sort: RECORD_LIST_SORT, ...boundary });
  });
  it('malformed·버전·범위·크기 불일치 cursor를 구분해 거부한다', () => {
    const cursor = encodeRecordCursor({ ...scope, limit: 20 }, boundary);
    const changedVersion = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')), v: 2 })).toString('base64url');
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
