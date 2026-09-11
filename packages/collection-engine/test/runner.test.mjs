import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { CollectionRunnerError, runCollection } from '../dist/index.js';

const fixture = (name) => join(import.meta.dirname, 'fixtures', name);
const plugin = {
  id: 'generic-plugin', name: 'Generic', version: '0.1.0', transformPath: fixture('valid.mjs'),
  data: { types: { item: { uniqueKey: 'id', fields: {
    id: { type: 'string', required: true }, score: { type: 'number', required: true },
  } } } },
};
const scope = { pluginId: 'generic-plugin', sourceId: 'source-a', scopeType: 'full', scopeKey: '', configRevision: 'rev-1' };
const transform = ({ record }) => {
  if (record.reject) throw new Error(`secret-${record.id}`);
  return { records: [{ type: 'item', values: { id: record.id, score: record.score } }] };
};
const times = ['2026-09-11T00:00:00Z', '2026-09-11T00:01:00Z', '2026-09-11T00:02:00Z'];

function createStorage(initialCheckpoint = null, overrides = {}) {
  let checkpoint = initialCheckpoint;
  const calls = [];
  const storage = {
    calls,
    get checkpoint() { return checkpoint; },
    async getCheckpoint(input) { calls.push(['getCheckpoint', input]); return checkpoint; },
    async startRun(input) { calls.push(['startRun', input]); return 'run-1'; },
    async commitBatch(input) { calls.push(['commitBatch', input]); checkpoint = input.nextCheckpoint; },
    async finishRun(input) { calls.push(['finishRun', input]); },
    ...overrides,
  };
  return storage;
}

function batch(startCheckpoint, nextCheckpoint, records, collectedAt = '2026-09-11T00:00:30Z') {
  return { startCheckpoint, nextCheckpoint, records, collectedAt };
}

describe('runCollection', () => {
  test('저장된 opaque checkpoint부터 범용 collector를 실행하고 성공을 기록한다', async () => {
    const storage = createStorage({ cursor: 'saved' });
    const contexts = [];
    const result = await runCollection({ plugin, scope, storage, transform, now: () => times.shift(),
      collector: async (context, onBatch) => {
        contexts.push(context);
        await onBatch(batch({ cursor: 'saved' }, { cursor: 'next' }, [{ id: 'a', score: 1 }]));
      },
    });

    expect(contexts[0].checkpoint).toEqual({ cursor: 'saved' });
    expect(storage.calls.map(([name]) => name)).toEqual(['getCheckpoint', 'startRun', 'commitBatch', 'finishRun']);
    expect(storage.calls[2][1]).toMatchObject({
      runId: 'run-1', expectedCheckpoint: { cursor: 'saved' }, nextCheckpoint: { cursor: 'next' },
      processedCount: 1, acceptedCount: 1,
      records: [{ type: 'item', key: 'a', values: { id: 'a', score: 1 } }], issues: [],
    });
    expect(storage.calls[3][1]).toMatchObject({ status: 'success' });
    expect(result).toEqual({ runId: 'run-1', status: 'success', batches: 1, processed: 1, accepted: 1, rejected: 0, checkpoint: { cursor: 'next' } });
  });

  test('가공 격리 오류를 정상 레코드와 원자 저장하고 partial로 집계한다', async () => {
    const storage = createStorage();
    const result = await runCollection({ plugin, scope, storage, transform,
      collector: async (_context, onBatch) => {
        await onBatch(batch(null, { page: 1 }, [{ id: 'ok', score: 1 }, { id: 'bad', reject: true }]));
        await onBatch(batch({ page: 1 }, { page: 2 }, [{ id: 'next', score: 2 }]));
      },
    });
    const commits = storage.calls.filter(([name]) => name === 'commitBatch').map(([, input]) => input);
    expect(commits).toHaveLength(2);
    expect(commits[0].records.map((record) => record.key)).toEqual(['ok']);
    expect(commits[0].issues).toEqual([{ sourceIndex: 1, code: 'TRANSFORM_FAILED', path: '/', message: 'transform failed' }]);
    expect(JSON.stringify(commits)).not.toContain('secret-bad');
    expect(result).toMatchObject({ status: 'partial', batches: 2, processed: 3, accepted: 2, rejected: 1 });
    expect(storage.calls.at(-1)[1]).toMatchObject({ status: 'partial' });
  });

  test('느린 storage commit이 끝날 때까지 다음 묶음을 요청하지 않는다', async () => {
    let releaseCommit;
    const commitGate = new Promise((resolve) => { releaseCommit = resolve; });
    const events = [];
    const storage = createStorage(null, { async commitBatch(input) { events.push(`commit-${input.nextCheckpoint}`); await commitGate; events.push('committed'); } });
    const running = runCollection({ plugin, scope, storage, transform,
      collector: async (_context, onBatch) => {
        events.push('batch-1'); await onBatch(batch(null, 1, [{ id: 'a', score: 1 }]));
        events.push('batch-2'); await onBatch(batch(1, 2, [{ id: 'b', score: 2 }]));
      },
    });
    await vi.waitFor(() => expect(events).toEqual(['batch-1', 'commit-1']));
    releaseCommit();
    await running;
    expect(events).toEqual(['batch-1', 'commit-1', 'committed', 'batch-2', 'commit-2', 'committed']);
  });

  test.each([
    ['collector', async () => { throw new Error('https://secret.invalid/token'); }, 'collection'],
    ['storage', async (_context, onBatch) => { await onBatch(batch(null, 1, [{ id: 'a', score: 1 }])); }, 'storage'],
  ])('%s 실패를 안정된 오류로 반환하고 실행을 failed로 종료한다', async (_name, collector, code) => {
    const storage = createStorage(null, code === 'storage' ? { async commitBatch() { throw new Error('password=secret'); } } : {});
    await expect(runCollection({ plugin, scope, storage, transform, collector })).rejects.toEqual(expect.objectContaining({ code }));
    expect(storage.calls.at(-1)).toEqual(['finishRun', expect.objectContaining({ status: 'failed' })]);
    await runCollection({ plugin, scope, storage: createStorage(), transform, collector }).catch((error) => {
      expect(error.message).not.toMatch(/secret|password|https:/);
    });
  });

  test('모듈 로딩 실패는 원천 요청과 실행 시작 전에 거부한다', async () => {
    const storage = createStorage();
    let collected = false;
    const missingPlugin = { ...plugin, transformPath: fixture('missing.mjs') };
    await expect(runCollection({ plugin: missingPlugin, scope, storage, collector: async () => { collected = true; } }))
      .rejects.toEqual(expect.objectContaining({ code: 'module_load' }));
    expect(collected).toBe(false);
    expect(storage.calls.map(([name]) => name)).toEqual(['getCheckpoint']);
  });

  test('저장 실패 후 checkpoint를 유지하고 같은 위치에서 재실행한다', async () => {
    const starts = [];
    const storage = createStorage({ offset: 10 }, { async commitBatch() { throw new Error('db'); } });
    const collector = async (context, onBatch) => { starts.push(context.checkpoint); await onBatch(batch(context.checkpoint, { offset: 20 }, [{ id: 'a', score: 1 }])); };
    await expect(runCollection({ plugin, scope, storage, transform, collector })).rejects.toMatchObject({ code: 'storage' });
    await expect(runCollection({ plugin, scope, storage, transform, collector })).rejects.toMatchObject({ code: 'storage' });
    expect(starts).toEqual([{ offset: 10 }, { offset: 10 }]);
    expect(storage.checkpoint).toEqual({ offset: 10 });
  });

  test('취소 후 새 묶음을 시작하지 않는다', async () => {
    const controller = new AbortController();
    const storage = createStorage();
    let secondBatch = false;
    await expect(runCollection({ plugin, scope, storage, transform, signal: controller.signal,
      collector: async (_context, onBatch) => {
        await onBatch(batch(null, 1, [{ id: 'a', score: 1 }]));
        secondBatch = true;
        await onBatch(batch(1, 2, [{ id: 'b', score: 2 }]));
      },
      now: () => { controller.abort(); return '2026-09-11T00:00:00Z'; },
    })).rejects.toMatchObject({ code: 'cancelled' });
    expect(secondBatch).toBe(false);
  });

  test('진행 중 commit에서 취소되면 commit 완료 후 다음 작업을 막는다', async () => {
    const controller = new AbortController();
    let commits = 0;
    const storage = createStorage(null, { async commitBatch() { commits += 1; controller.abort(); } });
    let secondBatch = false;
    await expect(runCollection({ plugin, scope, storage, transform, signal: controller.signal,
      collector: async (_context, onBatch) => {
        await onBatch(batch(null, 1, [{ id: 'a', score: 1 }]));
        secondBatch = true;
      },
    })).rejects.toMatchObject({ code: 'cancelled' });
    expect(commits).toBe(1);
    expect(secondBatch).toBe(false);
  });

  test('가공 직후 취소되면 storage commit을 시작하지 않는다', async () => {
    const controller = new AbortController();
    const storage = createStorage();
    await expect(runCollection({ plugin, scope, storage, signal: controller.signal,
      transform: ({ record }) => {
        controller.abort();
        return { records: [{ type: 'item', values: { id: record.id, score: record.score } }] };
      },
      collector: async (_context, onBatch) => onBatch(batch(null, 1, [{ id: 'a', score: 1 }])),
    })).rejects.toMatchObject({ code: 'cancelled' });
    expect(storage.calls.some(([name]) => name === 'commitBatch')).toBe(false);
  });

  test('가공 결과 consumer의 방어적 실패를 안정된 오류로 정규화한다', async () => {
    let uniqueKeyReads = 0;
    const changingDefinition = { fields: plugin.data.types.item.fields };
    Object.defineProperty(changingDefinition, 'uniqueKey', {
      get() { uniqueKeyReads += 1; return uniqueKeyReads === 1 ? 'id' : 'missing'; },
    });
    const changingPlugin = { ...plugin, data: { types: { item: changingDefinition } } };
    const storage = createStorage();
    await expect(runCollection({ plugin: changingPlugin, scope, storage, transform,
      collector: async (_context, onBatch) => onBatch(batch(null, 1, [{ id: 'a', score: 1 }])),
    })).rejects.toMatchObject({ code: 'transform_consumer' });
    expect(storage.calls.at(-1)).toEqual(['finishRun', expect.objectContaining({ status: 'failed' })]);
  });

  test('많은 묶음에서 현재 묶음만 보유하고 숫자 집계만 반환한다', async () => {
    const storage = createStorage();
    let checkpoint = null;
    const result = await runCollection({ plugin, scope, storage, transform,
      collector: async (_context, onBatch) => {
        for (let index = 0; index < 2_000; index += 1) {
          const next = `token-${index}`;
          await onBatch(batch(checkpoint, next, [{ id: String(index), score: index }]));
          checkpoint = next;
        }
      },
    });
    expect(result).toMatchObject({ status: 'success', batches: 2_000, processed: 2_000, accepted: 2_000, rejected: 0 });
    expect(Object.keys(result).sort()).toEqual(['accepted', 'batches', 'checkpoint', 'processed', 'rejected', 'runId', 'status']);
  });

  test('checkpoint 불연속과 사전 취소를 거부한다', async () => {
    const storage = createStorage({ cursor: 1 });
    await expect(runCollection({ plugin, scope, storage, transform,
      collector: async (_context, onBatch) => onBatch(batch({ cursor: 0 }, { cursor: 2 }, [])),
    })).rejects.toMatchObject({ code: 'collection' });
    const controller = new AbortController(); controller.abort();
    await expect(runCollection({ plugin, scope, storage: createStorage(), transform, signal: controller.signal, collector: async () => {} }))
      .rejects.toEqual(new CollectionRunnerError('cancelled'));
  });
});
