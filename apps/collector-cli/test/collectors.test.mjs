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
