import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { collectorFor } from '../dist/index.js';

const servers = [];
const directories = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const plugin = { id: 'sample-plugin', name: 'Sample', version: '1', transformPath: '/tmp/transform.js', data: { types: {} } };
async function server(handler) {
  const instance = createServer(handler);
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  servers.push(instance);
  return `http://127.0.0.1:${instance.address().port}`;
}

it('offset checkpoint와 AbortSignal을 기존 HTTP collector에 전달한다', async () => {
  const requested = [];
  const baseUrl = await server((request, response) => {
    requested.push(request.url);
    const offset = Number(new URL(request.url, 'http://x').searchParams.get('offset'));
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ data: { items: offset === 1 ? [{ id: 2 }] : [], total: 2 } }));
  });
  const definition = { plugin, connection: { id: 'source', baseUrl }, request: { method: 'GET', path: '/items', format: 'json' }, limits: { timeoutMs: 1000, maxResponseBytes: 1000, maxRecordBytes: 100 }, response: { itemsPath: 'data.items', totalPath: 'data.total' }, pagination: { type: 'offset', offsetParam: 'offset', limitParam: 'limit', start: 0, limit: 1 } };
  const batches = [];
  const signal = new AbortController().signal;
  await collectorFor(definition, () => '2026-09-11T00:00:00.000Z')({ checkpoint: 1, signal }, async (batch) => batches.push(batch));
  expect(requested).toEqual(['/items?offset=1&limit=1']);
  expect(batches[0]).toMatchObject({ startCheckpoint: 1, nextCheckpoint: 2, records: [{ id: 2 }], collectedAt: '2026-09-11T00:00:00.000Z' });
});

it('최초 offset 묶음은 null checkpoint를 보존한다', async () => {
  const baseUrl = await server((_request, response) => { response.end('{"data":{"items":[{"id":1}],"total":1}}'); });
  const definition = { plugin, connection: { id: 'source', baseUrl }, request: { method: 'GET', path: '/items', format: 'json' }, limits: { timeoutMs: 1000, maxResponseBytes: 1000, maxRecordBytes: 100 }, response: { itemsPath: 'data.items', totalPath: 'data.total' }, pagination: { type: 'offset', offsetParam: 'offset', limitParam: 'limit', start: 0, limit: 1 } };
  const batches = [];
  await collectorFor(definition, () => '2026-09-11T00:00:00.000Z')({ checkpoint: null, signal: new AbortController().signal }, async (batch) => batches.push(batch));
  expect(batches[0]).toMatchObject({ startCheckpoint: null, nextCheckpoint: 1 });
});

it('single checkpoint가 있으면 재요청하지 않는다', async () => {
  let requests = 0;
  const baseUrl = await server((_request, response) => { requests += 1; response.end('{"items":[]}'); });
  const definition = { plugin, connection: { id: 'source', baseUrl }, request: { method: 'GET', path: '/items', format: 'json' }, limits: { timeoutMs: 1000, maxResponseBytes: 1000, maxRecordBytes: 100 }, response: { itemsPath: 'items' }, pagination: { type: 'single' } };
  await collectorFor(definition, () => '2026-09-11T00:00:00.000Z')({ checkpoint: { complete: true }, signal: new AbortController().signal }, async () => undefined);
  expect(requests).toBe(0);
});

it('CSV numeric checkpoint 이후 레코드만 전달한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'collector-cli-'));
  directories.push(directory);
  const path = join(directory, 'source.csv');
  await writeFile(path, 'id,name\n1,one\n2,two\n3,three\n');
  const definition = { plugin, source: { transport: 'file', format: 'csv', path }, batching: { size: 2 }, limits: {} };
  const batches = [];
  await collectorFor(definition, () => '2026-09-11T00:00:00.000Z')({ checkpoint: 2, signal: new AbortController().signal }, async (batch) => batches.push(batch));
  expect(batches).toHaveLength(1);
  expect(batches[0]).toMatchObject({ startCheckpoint: 2, nextCheckpoint: 3, records: [{ id: '3', name: 'three' }] });
});

function httpCsvDefinition(baseUrl, batchSize = 2) {
  return {
    plugin,
    connection: { id: 'csv-source', baseUrl },
    request: { transport: 'http', method: 'GET', path: '/source.csv', format: 'csv' },
    batching: { size: batchSize },
    limits: { timeoutMs: 1000, maxDownloadBytes: 10_000, maxCsvBytes: 10_000, maxRecordSize: 1000 },
  };
}

it('플러그인의 HTTP CSV 선언을 여러 공통 묶음과 완료 metadata로 변환한다', async () => {
  const baseUrl = await server((_request, response) => {
    response.setHeader('content-type', 'text/csv');
    response.end('id,name\n1,one\n2,two\n3,three\n');
  });
  const batches = [];
  await collectorFor(httpCsvDefinition(baseUrl), () => '2026-09-13T00:00:00.000Z')(
    { checkpoint: null, signal: new AbortController().signal },
    async (batch) => batches.push(batch),
  );
  expect(batches).toMatchObject([
    { startCheckpoint: null, nextCheckpoint: 2, records: [{ id: '1', name: 'one' }, { id: '2', name: 'two' }], responseMetadata: { complete: false } },
    { startCheckpoint: 2, nextCheckpoint: 3, records: [{ id: '3', name: 'three' }], responseMetadata: { complete: true } },
  ]);
});

it('HTTP CSV numeric checkpoint가 묶음 중간이면 확정 행만 건너뛴다', async () => {
  const baseUrl = await server((_request, response) => {
    response.end('id,name\n1,one\n2,two\n3,three\n4,four\n5,five\n');
  });
  const batches = [];
  await collectorFor(httpCsvDefinition(baseUrl, 3), () => '2026-09-13T00:00:00.000Z')(
    { checkpoint: 2, signal: new AbortController().signal },
    async (batch) => batches.push(batch),
  );
  expect(batches).toMatchObject([
    { startCheckpoint: 2, nextCheckpoint: 3, records: [{ id: '3', name: 'three' }], responseMetadata: { complete: false } },
    { startCheckpoint: 3, nextCheckpoint: 5, records: [{ id: '4', name: 'four' }, { id: '5', name: 'five' }], responseMetadata: { complete: true } },
  ]);
});

it('HTTP CSV의 잘못된 checkpoint와 실패·취소를 성공으로 처리하지 않는다', async () => {
  let requests = 0;
  const baseUrl = await server((_request, response) => {
    requests += 1;
    response.end('id,name\n1,one\n2,two\n');
  });
  const definition = httpCsvDefinition(baseUrl, 1);
  const signal = new AbortController().signal;
  await expect(collectorFor(definition, () => '2026-09-13T00:00:00.000Z')(
    { checkpoint: 'invalid', signal }, async () => undefined,
  )).rejects.toMatchObject({ code: 'collection_failed' });
  expect(requests).toBe(0);

  let delivered = 0;
  await expect(collectorFor(definition, () => '2026-09-13T00:00:00.000Z')(
    { checkpoint: null, signal },
    async () => { delivered += 1; throw new Error('storage failed'); },
  )).rejects.toMatchObject({ code: 'processing' });
  expect(delivered).toBe(1);

  const controller = new AbortController();
  controller.abort();
  await expect(collectorFor(definition, () => '2026-09-13T00:00:00.000Z')(
    { checkpoint: null, signal: controller.signal }, async () => undefined,
  )).rejects.toMatchObject({ code: 'cancelled' });
});
