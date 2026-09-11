import { describe, expect, it } from 'vitest';
import { QueryError, summarizeSourceValues, validateListRecordsInput, validateRecordId } from '../dist/index.js';
describe('공통 조회 입력 계약', () => {
  it('기본 목록 크기와 유효한 사용자 크기를 정규화한다', () => { const scope = { pluginId: 'sample', sourceId: 'source', dataType: 'asset' }; expect(validateListRecordsInput(scope).limit).toBe(50); expect(validateListRecordsInput({ ...scope, limit: 200 }).limit).toBe(200); });
  it.each([0, 201, 1.5, Number.NaN])('잘못된 목록 크기 %s를 거부한다', limit => { expect(() => validateListRecordsInput({ pluginId: 'p', sourceId: 's', dataType: 'asset', limit })).toThrowError(expect.objectContaining({ code: 'INVALID_QUERY' })); });
  it('빈 범위와 잘못된 UUID를 DB 접근 전에 거부한다', () => { expect(() => validateListRecordsInput({ pluginId: '', sourceId: 's', dataType: 'asset' })).toThrowError(QueryError); expect(() => validateRecordId('not-a-uuid')).toThrowError(expect.objectContaining({ code: 'INVALID_QUERY' })); expect(() => validateRecordId('00000000-0000-4000-8000-000000000001')).not.toThrow(); });
  it('8 KiB를 초과하는 최상위 필드를 제외하고 이름을 정렬한다', () => { expect(summarizeSourceValues({ z: 'x'.repeat(8193), name: 'asset', a: { body: 'x'.repeat(8193) } })).toEqual({ sourceValues: { name: 'asset' }, omittedFields: ['a', 'z'] }); });
});
