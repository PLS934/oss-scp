import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { clearTransformCache, loadTransform, processRecords, TRANSFORM_LIMITS } from '../dist/index.js';

const fixture = (name) => join(import.meta.dirname, 'fixtures', name);
const plugin = {
  id: 'test-plugin', name: 'Test', version: '0.1.0', transformPath: fixture('valid.mjs'),
  data: {
    types: {
      item: { uniqueKey: 'id', fields: {
        id: { type: 'string', required: true }, score: { type: 'number', required: true }, active: { type: 'boolean' },
        at: { type: 'datetime' }, nested: { type: 'object', fields: { label: { type: 'string', required: true } } },
        tags: { type: 'array', items: { type: 'string' } },
      } },
    },
    relations: { linked: { from: { types: ['item'] }, to: { types: ['item'] } } },
  },
};

const valid = (id) => ({ id, score: 1, active: true, at: '2026-09-10T00:00:00Z', nested: { label: 'ok' }, tags: ['a'] });

describe('transform module loader', () => {
  test('모듈을 캐시하고 transform을 반환한다', async () => {
    clearTransformCache();
    const first = await loadTransform(fixture('valid.mjs'));
    const second = await loadTransform(fixture('valid.mjs'));
    expect(first).toBe(second);
  });

  test.each(['invalid.mjs', 'missing.mjs'])('잘못된 모듈을 거부한다: %s', async (name) => {
    clearTransformCache();
    await expect(loadTransform(fixture(name))).rejects.toMatchObject({ code: 'MODULE_LOAD_FAILED' });
  });
});

describe('processRecords', () => {
  test('동기·비동기 결과를 순서대로 소비하고 완료를 기다린다', async () => {
    const events = [];
    const result = await processRecords({ plugin, sourceId: 'source', collectedAt: '2026-09-10T00:00:00Z', records: [valid('a'), valid('b')],
      transform: async ({ record }) => { events.push(`transform-${record.id}`); return { records: [{ type: 'item', values: record }] }; },
      consume: async (batch) => { events.push(`consume-${batch.records.length}`); },
    });
    expect(result).toMatchObject({ status: 'success', processed: 2, accepted: 2, rejected: 0 });
    expect(events).toEqual(['transform-a', 'transform-b', 'consume-2']);
  });

  test('예외와 검증 실패를 격리하고 비민감 partial 오류를 반환한다', async () => {
    const consumed = [];
    const result = await processRecords({ plugin, sourceId: 'secret-source', collectedAt: '2026-09-10T00:00:00Z', records: [valid('a'), { id: 'secret' }, valid('c')],
      transform: ({ record }) => { if (record.id === 'secret') throw new Error('DO_NOT_LEAK'); return { records: [{ type: 'item', values: record }] }; },
      consume: async (batch) => consumed.push(...batch.records),
    });
    expect(result).toMatchObject({ status: 'partial', processed: 3, accepted: 2, rejected: 1 });
    expect(result.issues[0]).toEqual({ pluginId: 'test-plugin', sourceIndex: 1, code: 'TRANSFORM_FAILED', path: '/', message: 'transform failed' });
    expect(JSON.stringify(result)).not.toContain('DO_NOT_LEAK');
    expect(consumed.map((item) => item.values.id)).toEqual(['a', 'c']);
  });

  test.each([
    ['필수 필드', { id: 'a' }, 'REQUIRED_FIELD_MISSING'],
    ['필드 타입', { id: 'a', score: '1' }, 'INVALID_FIELD_TYPE'],
    ['datetime', { id: 'a', score: 1, at: 'bad' }, 'INVALID_DATETIME'],
    ['알 수 없는 필드', { id: 'a', score: 1, extra: true }, 'UNKNOWN_FIELD'],
    ['빈 유일키', { id: '', score: 1 }, 'INVALID_UNIQUE_KEY'],
  ])('%s 오류를 검증한다', async (_name, values, code) => {
    const result = await processRecords({ plugin, sourceId: 's', collectedAt: '2026-09-10T00:00:00Z', records: [values], transform: ({ record }) => ({ records: [{ type: 'item', values: record }] }), consume: async () => {} });
    expect(result).toMatchObject({ status: 'partial', rejected: 1 });
    expect(result.issues[0].code).toBe(code);
  });

  test('중복 키를 거부하고 앞선 정상 결과만 소비한다', async () => {
    const batches = [];
    const result = await processRecords({ plugin, sourceId: 's', collectedAt: '2026-09-10T00:00:00Z', records: [valid('same'), valid('same')], transform: ({ record }) => ({ records: [{ type: 'item', values: record }] }), consume: async (batch) => batches.push(batch) });
    expect(result).toMatchObject({ status: 'partial', accepted: 1, rejected: 1 });
    expect(result.issues[0]).toMatchObject({ code: 'DUPLICATE_UNIQUE_KEY', keyHint: 'same' });
  });

  test('관계 하나가 잘못되면 같은 호출의 출력 전체를 제외한다', async () => {
    const batches = [];
    const result = await processRecords({ plugin, sourceId: 's', collectedAt: '2026-09-10T00:00:00Z', records: [valid('a')], transform: ({ record }) => ({ records: [{ type: 'item', values: record }], relations: [{ type: 'linked', from: { type: 'item', key: 'a' }, to: { type: 'item', key: 'missing' } }] }), consume: async (batch) => batches.push(batch) });
    expect(result.issues[0].code).toBe('INVALID_RELATION');
    expect(batches).toHaveLength(0);
  });

  test('배열·깊이·레코드·관계·바이트 제한을 검사한다', async () => {
    let deepField = { type: 'string' };
    let deepValue = 'end';
    for (let index = 0; index < TRANSFORM_LIMITS.depth + 1; index += 1) {
      deepField = { type: 'object', fields: { child: deepField } };
      deepValue = { child: deepValue };
    }
    const deepPlugin = JSON.parse(JSON.stringify(plugin));
    deepPlugin.data.types.item.fields.deep = deepField;
    const cases = [
      { output: { records: [{ type: 'item', values: { ...valid('a'), tags: Array(TRANSFORM_LIMITS.arrayItems + 1).fill('x') } }] }, code: 'MAX_ARRAY_ITEMS_EXCEEDED' },
      { output: { records: Array.from({ length: TRANSFORM_LIMITS.recordsPerSource + 1 }, (_, i) => ({ type: 'item', values: valid(String(i)) })) }, code: 'MAX_RECORDS_EXCEEDED' },
      { output: { records: [{ type: 'item', values: valid('a') }], relations: Array(TRANSFORM_LIMITS.relationsPerSource + 1).fill({}) }, code: 'MAX_RELATIONS_EXCEEDED' },
      { output: { records: [{ type: 'item', values: { ...valid('a'), tags: ['x'.repeat(TRANSFORM_LIMITS.outputBytes)] } }] }, code: 'MAX_OUTPUT_BYTES_EXCEEDED' },
      { output: { records: [{ type: 'item', values: { ...valid('a'), deep: deepValue } }] }, code: 'MAX_DEPTH_EXCEEDED', plugin: deepPlugin },
    ];
    for (const item of cases) {
      const result = await processRecords({ plugin: item.plugin ?? plugin, sourceId: 's', collectedAt: '2026-09-10T00:00:00Z', records: [{}], transform: () => item.output, consume: async () => {} });
      expect(result.issues[0].code).toBe(item.code);
    }
  });

  test('취소와 소비자 실패는 실행 전체 오류다', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(processRecords({ plugin, sourceId: 's', collectedAt: '2026-09-10T00:00:00Z', records: [], signal: controller.signal, transform: () => ({ records: [] }), consume: async () => {} })).rejects.toEqual(expect.objectContaining({ code: 'ABORTED' }));
    await expect(processRecords({ plugin, sourceId: 's', collectedAt: '2026-09-10T00:00:00Z', records: [valid('a')], transform: ({ record }) => ({ records: [{ type: 'item', values: record }] }), consume: async () => { throw new Error('db'); } })).rejects.toEqual(expect.objectContaining({ code: 'CONSUMER_FAILED' }));
  });

  test('100개 단위로 소비해 결과 전체를 누적하지 않는다', async () => {
    const sizes = [];
    const rows = Array.from({ length: 250 }, (_, index) => valid(String(index)));
    const result = await processRecords({ plugin, sourceId: 's', collectedAt: '2026-09-10T00:00:00Z', records: rows, transform: ({ record }) => ({ records: [{ type: 'item', values: record }] }), consume: async (batch) => sizes.push(batch.records.length) });
    expect(result.status).toBe('success');
    expect(sizes).toEqual([100, 100, 50]);
  });

  test('10,000건을 고정된 100건 입력 묶음으로 반복 처리한다', async () => {
    let accepted = 0;
    let maxConsumed = 0;
    const startedAt = performance.now();
    for (let batch = 0; batch < 100; batch += 1) {
      const rows = Array.from({ length: 100 }, (_, index) => valid(`${batch}-${index}`));
      const result = await processRecords({ plugin, sourceId: 's', collectedAt: '2026-09-10T00:00:00Z', records: rows, transform: ({ record }) => ({ records: [{ type: 'item', values: record }] }), consume: async (output) => { maxConsumed = Math.max(maxConsumed, output.records.length); } });
      accepted += result.accepted;
    }
    expect(accepted).toBe(10_000);
    expect(maxConsumed).toBe(100);
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  });
});
