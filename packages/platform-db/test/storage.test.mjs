import { describe, expect, it } from 'vitest';
import {
  canonicalExternalKey, collectionLeaseIdentity, collectionScopeIdentity, StorageError, validateCommitBatch, validateStartRun,
} from '../dist/index.js';

const scope = { pluginId: 'sample', sourceId: 'source', scopeType: 'full', scopeKey: '', configRevision: 'rev-1' };
const batch = patch => ({
  runId: '00000000-0000-4000-8000-000000000001', scope, observedAt: '2026-09-11T00:00:00Z',
  expectedCheckpoint: null, nextCheckpoint: { offset: 1 }, processedCount: 1, acceptedCount: 1,
  records: [{ type: 'asset', key: '1', values: { id: '1' } }], relations: [], issues: [], ...patch,
});

describe('공통 저장 입력 계약', () => {
  it('revision별 실행 이력 identity와 revision을 제외한 lease identity를 분리한다', () => {
    const changed = { ...scope, configRevision: 'rev-2' };
    expect(collectionScopeIdentity(scope)).not.toEqual(collectionScopeIdentity(changed));
    expect(collectionLeaseIdentity(scope)).toEqual(collectionLeaseIdentity(changed));
  });

  it('scheduled metadata를 trigger와 함께만 허용한다', () => {
    const base = { ...scope, startedAt: '2026-09-19T13:00:01.000Z' };
    expect(() => validateStartRun({ ...base, trigger: 'scheduled', scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'Asia/Seoul' })).not.toThrow();
    for (const input of [
      { ...base, trigger: 'scheduled' },
      { ...base, trigger: 'scheduled', scheduledAt: 'not-an-instant', scheduleTimezone: 'Asia/Seoul' },
      { ...base, trigger: 'scheduled', scheduledAt: '2026-09-19T13:00:00Z', scheduleTimezone: 'Asia/Seoul' },
      { ...base, trigger: 'scheduled', scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'invalid/zone' },
      { ...base, trigger: 'cli', scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'Asia/Seoul' },
      { ...base, trigger: 'scheduled', requestId: 'request-1', scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'Asia/Seoul' },
    ]) expect(() => validateStartRun(input)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });
  it('문자열·숫자 키와 -0을 손실 없이 canonical 형태로 구분한다', () => {
    expect(canonicalExternalKey('1')).toEqual({ type: 'string', value: '1' });
    expect(canonicalExternalKey(1)).toEqual({ type: 'number', value: '1' });
    expect(canonicalExternalKey(-0)).toEqual({ type: 'number', value: '0' });
    for (const value of [NaN, Infinity, -Infinity]) expect(() => canonicalExternalKey(value)).toThrowError(StorageError);
  });

  it('묶음 안의 타입 보존 중복 키를 거부한다', () => {
    expect(() => validateCommitBatch(batch({
      processedCount: 2, acceptedCount: 2,
      records: [{ type: 'asset', key: 1, values: {} }, { type: 'asset', key: 1, values: {} }],
    }))).toThrowError(expect.objectContaining({ code: 'DUPLICATE_KEY' }));
    expect(() => validateCommitBatch(batch({
      processedCount: 2, acceptedCount: 2,
      records: [{ type: 'asset', key: 1, values: {} }, { type: 'asset', key: '1', values: {} }],
    }))).not.toThrow();
  });

  it('레코드와 checkpoint 크기 제한을 적용한다', () => {
    expect(() => validateCommitBatch(batch({ records: [{ type: 'asset', key: '1', values: { body: 'x'.repeat(1024 * 1024) } }] }))).toThrowError(expect.objectContaining({ code: 'RECORD_TOO_LARGE' }));
    expect(() => validateCommitBatch(batch({ nextCheckpoint: { token: 'x'.repeat(64 * 1024) } }))).toThrowError(expect.objectContaining({ code: 'CHECKPOINT_TOO_LARGE' }));
    expect(() => validateCommitBatch(batch({ nextCheckpoint: null }))).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });

  it('유한하지 않거나 JSON으로 보존할 수 없는 원천 값을 거부한다', () => {
    for (const value of [{ score: NaN }, { nested: { score: Infinity } }, { missing: undefined }]) {
      expect(() => validateCommitBatch(batch({ records: [{ type: 'asset', key: '1', values: value }] }))).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    }
  });

  it('공개 오류에 입력 원문이나 driver cause를 포함하지 않는다', () => {
    const marker = 'sensitive-driver-password';
    const error = new StorageError('PERSIST_FAILED');
    expect(error.message).toBe('플랫폼 데이터 저장에 실패했습니다.');
    expect(error.message).not.toContain(marker);
    expect(error).not.toHaveProperty('cause');
  });
});
