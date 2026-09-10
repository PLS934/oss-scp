import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { collectHttpOffset, HttpCollectorError } from '../dist/index.js';

const sample = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../fixtures/sources/sample1.json'), 'utf8'),
);
let server;
let origin;
let requests;

function definition(overrides = {}) {
  return {
    plugin: { id: 'test', name: 'Test', version: '0.1.0' },
    connection: { id: 'test', baseUrl: origin },
    request: { method: 'GET', path: '/sample?token=never-log-this', format: 'json' },
    response: { itemsPath: 'rows', totalPath: 'total' },
    pagination: { type: 'offset', offsetParam: 'offset', limitParam: 'limit', start: 0, limit: 20 },
    limits: { timeoutMs: 500, maxResponseBytes: 2 * 1024 * 1024, maxRecordBytes: 256 * 1024 },
    ...overrides,
  };
}

function sendJson(response, value, options = {}) {
  const body = Buffer.from(JSON.stringify(value));
  const output = options.gzip ? gzipSync(body) : body;
  response.writeHead(200, {
    'content-type': 'application/json',
    ...(options.gzip ? { 'content-encoding': 'gzip' } : {}),
  });
  if (options.chunked) {
    for (let index = 0; index < output.length; index += 7) response.write(output.subarray(index, index + 7));
    response.end();
  } else response.end(output);
}

beforeEach(async () => {
  requests = [];
  server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    requests.push(url);
    const offset = Number(url.searchParams.get('offset') ?? url.searchParams.get('skip') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? url.searchParams.get('take') ?? 20);
    if (url.pathname === '/status') {
      response.writeHead(503); response.end('PRIVATE RESPONSE'); return;
    }
    if (url.pathname === '/slow') {
      setTimeout(() => sendJson(response, { total: 0, rows: [] }), 200); return;
    }
    if (url.pathname === '/slow-body') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.write('{"total":0,');
      setTimeout(() => response.end('"rows":[]}'), 200); return;
    }
    if (url.pathname === '/invalid-json') {
      response.writeHead(200); response.end('{secret:'); return;
    }
    if (url.pathname === '/invalid-path') {
      sendJson(response, { total: 1, rows: {} }); return;
    }
    if (url.pathname === '/invalid-total') {
      sendJson(response, { total: -1, rows: [] }); return;
    }
    if (url.pathname === '/custom') {
      sendJson(response, { meta: { count: 3 }, payload: { records: [{ id: 1 }, { id: 2 }, { id: 3 }].slice(offset, offset + limit) } }); return;
    }
    if (url.pathname === '/empty') {
      sendJson(response, { total: 0, rows: [] }); return;
    }
    if (url.pathname === '/changed') {
      sendJson(response, { total: offset === 0 ? 40 : 41, rows: sample.rows.slice(offset, offset + limit) }); return;
    }
    if (url.pathname === '/short') {
      sendJson(response, { total: 40, rows: offset === 0 ? sample.rows.slice(0, 19) : [] }); return;
    }
    if (url.pathname === '/large') {
      sendJson(response, { total: 2, rows: [{ value: 'ok' }, { value: 'x'.repeat(4096) }] }, { chunked: true, gzip: url.searchParams.has('gzip') }); return;
    }
    sendJson(response, { total: sample.rows.length, rows: sample.rows.slice(offset, offset + limit) });
  });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolvePromise) => server.close(resolvePromise));
});

async function expectCode(promise, code) {
  try {
    await promise;
    throw new Error('expected collection failure');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpCollectorError);
    expect(error.code).toBe(code);
    expect(error.message).not.toContain('never-log-this');
    expect(error.message).not.toContain('PRIVATE RESPONSE');
  }
}

describe('collectHttpOffset', () => {
  test('sample1 72건을 네 묶음으로 원본 순서대로 전달한다', async () => {
    const batches = [];
    const result = await collectHttpOffset(definition(), ({ items }) => batches.push(items));
    expect(batches.map((items) => items.length)).toEqual([20, 20, 20, 12]);
    expect(batches.flat()).toEqual(sample.rows);
    expect(requests.map((url) => url.searchParams.get('offset'))).toEqual(['0', '20', '40', '60']);
    expect(requests.every((url) => url.searchParams.get('token') === 'never-log-this')).toBe(true);
    expect(result).toEqual({ pages: 4, records: 72, total: 72 });
  });

  test('다른 주소, query 이름과 응답 경로를 설정만으로 처리한다', async () => {
    const received = [];
    const config = definition({
      request: { method: 'GET', path: '/custom', format: 'json' },
      response: { itemsPath: 'payload.records', totalPath: 'meta.count' },
      pagination: { type: 'offset', offsetParam: 'skip', limitParam: 'take', start: 0, limit: 3 },
    });
    await collectHttpOffset(config, ({ items }) => received.push(...items));
    expect(received).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(requests[0].searchParams.get('skip')).toBe('0');
  });

  test('0건은 callback 없이 한 요청으로 완료한다', async () => {
    const called = [];
    const result = await collectHttpOffset(definition({ request: { method: 'GET', path: '/empty', format: 'json' } }), () => called.push(true));
    expect(called).toEqual([]);
    expect(result).toEqual({ pages: 0, records: 0, total: 0 });
  });

  test('느린 callback이 끝날 때까지 다음 요청하지 않고 실패하면 중단한다', async () => {
    let release;
    const gate = new Promise((resolvePromise) => { release = resolvePromise; });
    const running = collectHttpOffset(definition(), async ({ offset }) => { if (offset === 0) await gate; });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 30));
    expect(requests).toHaveLength(1);
    release(); await running;
    requests = [];
    await expectCode(collectHttpOffset(definition(), () => { throw new Error('private'); }), 'processing');
    expect(requests).toHaveLength(1);
  });

  test.each([
    ['/status', 'http_status'], ['/invalid-json', 'invalid_json'], ['/invalid-path', 'invalid_response'], ['/invalid-total', 'invalid_response'], ['/short', 'count_mismatch'], ['/changed', 'total_changed'],
  ])('%s 실패를 코드로 구분하고 중단한다', async (path, code) => {
    await expectCode(collectHttpOffset(definition({ request: { method: 'GET', path, format: 'json' } }), () => {}), code);
  });

  test('chunked 및 gzip의 압축 해제된 응답과 레코드 한도를 적용한다', async () => {
    const base = { request: { method: 'GET', path: '/large', format: 'json' }, pagination: { type: 'offset', offsetParam: 'offset', limitParam: 'limit', start: 0, limit: 2 } };
    await expectCode(collectHttpOffset(definition({ ...base, limits: { timeoutMs: 500, maxResponseBytes: 1024, maxRecordBytes: 1024 } }), () => {}), 'response_too_large');
    await expectCode(collectHttpOffset(definition({ ...base, request: { method: 'GET', path: '/large?gzip=1', format: 'json' }, limits: { timeoutMs: 500, maxResponseBytes: 1024, maxRecordBytes: 1024 } }), () => {}), 'response_too_large');
    await expectCode(collectHttpOffset(definition({ ...base, limits: { timeoutMs: 500, maxResponseBytes: 8192, maxRecordBytes: 100 } }), () => {}), 'record_too_large');
  });

  test('요청 timeout과 요청/처리 취소를 구분한다', async () => {
    await expectCode(collectHttpOffset(definition({ request: { method: 'GET', path: '/slow', format: 'json' }, limits: { timeoutMs: 50, maxResponseBytes: 2048, maxRecordBytes: 1024 } }), () => {}), 'timeout');
    await expectCode(collectHttpOffset(definition({ request: { method: 'GET', path: '/slow-body', format: 'json' }, limits: { timeoutMs: 50, maxResponseBytes: 2048, maxRecordBytes: 1024 } }), () => {}), 'timeout');
    const requestAbort = new AbortController();
    const requestRun = collectHttpOffset(definition({ request: { method: 'GET', path: '/slow', format: 'json' } }), () => {}, { signal: requestAbort.signal });
    requestAbort.abort();
    await expectCode(requestRun, 'cancelled');
    const processingAbort = new AbortController();
    await expectCode(collectHttpOffset(definition(), async ({ signal }) => { processingAbort.abort(); expect(signal.aborted).toBe(true); }, { signal: processingAbort.signal }), 'cancelled');
  });
});

test('페이지가 10배여도 완료 묶음을 heap에 누적하지 않는다', () => {
  const worker = resolve(import.meta.dirname, 'memory-worker.mjs');
  const measure = (pages) => {
    const result = spawnSync(process.execPath, ['--expose-gc', worker, String(pages)], {
      encoding: 'utf8', timeout: 10_000,
    });
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout).increase;
  };
  const small = measure(5);
  const large = measure(50);
  expect(large).toBeLessThanOrEqual(Math.max(small * 2, small + 16 * 1024 * 1024));
});
