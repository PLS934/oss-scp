import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { collectHttpSingle, HttpCollectorError } from '../dist/index.js';

const sample = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../fixtures/sources/sample2.json'), 'utf8'),
);
let server;
let origin;
let requests;

function definition(overrides = {}) {
  return {
    plugin: { id: 'sample2', name: 'Sample 2', version: '0.1.0' },
    connection: { id: 'sample2', baseUrl: origin },
    request: { method: 'GET', path: '/sample?token=never-log-this', format: 'json' },
    response: { itemsPath: 'items', metadataPaths: ['test_field6'] },
    pagination: { type: 'single' },
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
    for (let index = 0; index < output.length; index += 7) {
      response.write(output.subarray(index, index + 7));
    }
    response.end();
  } else {
    response.end(output);
  }
}

beforeEach(async () => {
  requests = [];
  server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    requests.push(url);
    if (url.pathname === '/status') {
      response.writeHead(503);
      response.end('PRIVATE RESPONSE');
      return;
    }
    if (url.pathname === '/slow') {
      setTimeout(() => sendJson(response, { items: [], test_field6: true }), 200);
      return;
    }
    if (url.pathname === '/slow-body') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.write('{"items":[],');
      setTimeout(() => response.end('"test_field6":true}'), 200);
      return;
    }
    if (url.pathname === '/invalid-json') {
      response.writeHead(200);
      response.end('{secret:');
      return;
    }
    if (url.pathname === '/invalid-items') {
      sendJson(response, { items: {}, test_field6: true });
      return;
    }
    if (url.pathname === '/missing-items') {
      sendJson(response, { test_field6: true });
      return;
    }
    if (url.pathname === '/missing-metadata') {
      sendJson(response, { items: [{ id: 1 }] });
      return;
    }
    if (url.pathname === '/empty') {
      sendJson(response, { items: [], test_field6: true });
      return;
    }
    if (url.pathname === '/custom') {
      sendJson(response, {
        payload: { records: [{ id: 1, nested: { flags: [true, false] } }] },
        meta: { feed: { complete: true } },
        privateValue: 'not-delivered',
      });
      return;
    }
    if (url.pathname === '/large') {
      sendJson(
        response,
        { items: [{ value: 'ok' }, { value: 'x'.repeat(4096) }], test_field6: true },
        { chunked: true, gzip: url.searchParams.has('gzip') },
      );
      return;
    }
    sendJson(response, sample);
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

describe('collectHttpSingle', () => {
  test('sample2 153건과 선언된 metadata를 한 요청으로 원본 그대로 전달한다', async () => {
    const batches = [];
    const result = await collectHttpSingle(definition(), (batch) => batches.push(batch));

    expect(requests).toHaveLength(1);
    expect(batches).toHaveLength(1);
    expect(batches[0].items).toEqual(sample.items);
    expect(batches[0].responseMetadata).toEqual({ test_field6: true });
    expect(result).toEqual({ requests: 1, records: 153 });
    expect(Object.keys(result)).toEqual(['requests', 'records']);
  });

  test('다른 주소와 중첩 경로를 설정만으로 처리하고 미선언 값을 제외한다', async () => {
    const batches = [];
    const config = definition({
      request: { method: 'GET', path: '/custom', format: 'json' },
      response: { itemsPath: 'payload.records', metadataPaths: ['meta.feed'] },
    });
    await collectHttpSingle(config, (batch) => batches.push(batch));

    expect(batches[0].items).toEqual([{ id: 1, nested: { flags: [true, false] } }]);
    expect(batches[0].responseMetadata).toEqual({ 'meta.feed': { complete: true } });
    expect(batches[0].responseMetadata).not.toHaveProperty('privateValue');
  });

  test('metadata 선언이 없으면 responseMetadata를 생략한다', async () => {
    const batches = [];
    await collectHttpSingle(
      definition({ response: { itemsPath: 'items' } }),
      (batch) => batches.push(batch),
    );
    expect(batches[0]).not.toHaveProperty('responseMetadata');
  });

  test('빈 목록은 callback 없이 한 요청으로 완료한다', async () => {
    const called = [];
    const result = await collectHttpSingle(
      definition({ request: { method: 'GET', path: '/empty', format: 'json' } }),
      () => called.push(true),
    );
    expect(called).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(result).toEqual({ requests: 1, records: 0 });
  });

  test.each([
    ['/invalid-json', 'invalid_json'],
    ['/invalid-items', 'invalid_response'],
    ['/missing-items', 'invalid_response'],
    ['/missing-metadata', 'invalid_response'],
  ])('%s 실패를 전달 전에 구분한다', async (path, code) => {
    const called = [];
    await expectCode(
      collectHttpSingle(
        definition({ request: { method: 'GET', path, format: 'json' } }),
        () => called.push(true),
      ),
      code,
    );
    expect(called).toEqual([]);
  });

  test('chunked 및 gzip의 압축 해제된 응답과 레코드 한도를 적용한다', async () => {
    const base = { request: { method: 'GET', path: '/large', format: 'json' } };
    await expectCode(
      collectHttpSingle(
        definition({ ...base, limits: { timeoutMs: 500, maxResponseBytes: 1024, maxRecordBytes: 1024 } }),
        () => {},
      ),
      'response_too_large',
    );
    await expectCode(
      collectHttpSingle(
        definition({ request: { method: 'GET', path: '/large?gzip=1', format: 'json' }, limits: { timeoutMs: 500, maxResponseBytes: 1024, maxRecordBytes: 1024 } }),
        () => {},
      ),
      'response_too_large',
    );
    const called = [];
    await expectCode(
      collectHttpSingle(
        definition({ ...base, limits: { timeoutMs: 500, maxResponseBytes: 8192, maxRecordBytes: 100 } }),
        () => called.push(true),
      ),
      'record_too_large',
    );
    expect(called).toEqual([]);
  });

  test('HTTP 오류와 요청·본문 timeout을 구분한다', async () => {
    await expectCode(
      collectHttpSingle(definition({ request: { method: 'GET', path: '/status', format: 'json' } }), () => {}),
      'http_status',
    );
    for (const path of ['/slow', '/slow-body']) {
      await expectCode(
        collectHttpSingle(
          definition({ request: { method: 'GET', path, format: 'json' }, limits: { timeoutMs: 50, maxResponseBytes: 2048, maxRecordBytes: 1024 } }),
          () => {},
        ),
        'timeout',
      );
    }
  });

  test('요청 및 처리 중 취소를 구분하고 같은 signal을 전달한다', async () => {
    const requestAbort = new AbortController();
    const requestRun = collectHttpSingle(
      definition({ request: { method: 'GET', path: '/slow', format: 'json' } }),
      () => {},
      { signal: requestAbort.signal },
    );
    requestAbort.abort();
    await expectCode(requestRun, 'cancelled');

    const processingAbort = new AbortController();
    await expectCode(
      collectHttpSingle(
        definition(),
        async ({ signal }) => {
          expect(signal).toBe(processingAbort.signal);
          processingAbort.abort();
          expect(signal.aborted).toBe(true);
        },
        { signal: processingAbort.signal },
      ),
      'cancelled',
    );
  });

  test('callback 완료를 기다리고 처리 실패를 구분한다', async () => {
    let release;
    let completed = false;
    const gate = new Promise((resolvePromise) => { release = resolvePromise; });
    const running = collectHttpSingle(definition(), async () => {
      await gate;
      completed = true;
    });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 30));
    expect(completed).toBe(false);
    release();
    await running;
    expect(completed).toBe(true);

    await expectCode(
      collectHttpSingle(definition(), () => { throw new Error('private processing'); }),
      'processing',
    );
  });
});

function measureSingleMemory(count, options = {}) {
  const worker = resolve(import.meta.dirname, 'single-memory-worker.mjs');
  const result = spawnSync(
    process.execPath,
    ['--expose-gc', worker, String(count), ...(options.retainItems ? ['--retain-items'] : [])],
    {
      encoding: 'utf8',
      timeout: 10_000,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.signal).toBeNull();
  const measurement = JSON.parse(result.stdout);
  expect(measurement).toEqual(expect.objectContaining({
    schemaVersion: 1,
    count,
    summary: { requests: 1, records: count },
    retainedItemCount: options.retainItems ? count : 0,
    server: { exitCode: 0, signal: null, stderr: '' },
  }));
  expect(measurement.payloadBytes).toBeGreaterThan(0);
  expect(measurement.retainedBytes).toBeGreaterThanOrEqual(0);
  return measurement;
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function waitForProcessExit(pid, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (processExists(pid)) {
    if (Date.now() >= deadline) throw new Error(`process ${pid} did not exit`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
}

function expectSourceResponseReleased(small, large) {
  const payloadGrowth = large.payloadBytes - small.payloadBytes;
  const retainedGrowth = large.retainedBytes - small.retainedBytes;
  expect(payloadGrowth).toBeGreaterThan(7 * 1024 * 1024);
  expect(
    retainedGrowth,
    JSON.stringify({ small, large, payloadGrowth, retainedGrowth }),
  ).toBeLessThan(payloadGrowth / 4);
}

test('큰 single 응답은 완료 후 원천 크기에 비례한 메모리를 보관하지 않는다', () => {
  // 기존 같은 프로세스 fixture가 생성한 약 8.34 MiB 응답이 간헐적으로 남았으며,
  // server heap을 분리하면 collector 제품 참조에 의한 비례 보관은 재현되지 않는다.
  const small = measureSingleMemory(20);
  const large = measureSingleMemory(2000);
  expectSourceResponseReleased(small, large);

  const retainedSmall = measureSingleMemory(20, { retainItems: true });
  const retainedLarge = measureSingleMemory(2000, { retainItems: true });
  expect(() => expectSourceResponseReleased(retainedSmall, retainedLarge)).toThrow();
});

test('메모리 worker 강제 종료 시 server child도 종료한다', async () => {
  const worker = resolve(import.meta.dirname, 'single-memory-worker.mjs');
  const running = spawn(
    process.execPath,
    ['--expose-gc', worker, '1', '--wait-for-parent-kill'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const lines = createInterface({ input: running.stdout });
  let serverPid;
  try {
    const [line] = await once(lines, 'line', { signal: AbortSignal.timeout(2000) });
    const ready = JSON.parse(line);
    expect(ready).toEqual(expect.objectContaining({
      schemaVersion: 1,
      serverPid: expect.any(Number),
      serverPort: expect.any(Number),
    }));
    serverPid = ready.serverPid;
    expect(processExists(serverPid)).toBe(true);

    const workerExit = once(running, 'exit', { signal: AbortSignal.timeout(2000) });
    expect(running.kill('SIGKILL')).toBe(true);
    expect(await workerExit).toEqual([null, 'SIGKILL']);
    await waitForProcessExit(serverPid);
    expect(processExists(serverPid)).toBe(false);
  } finally {
    lines.close();
    if (running.exitCode === null && running.signalCode === null) {
      const workerExit = once(running, 'exit', { signal: AbortSignal.timeout(2000) });
      running.kill('SIGKILL');
      await workerExit.catch(() => {});
    }
    if (serverPid !== undefined && processExists(serverPid)) {
      process.kill(serverPid, 'SIGKILL');
    }
  }
}, 10_000);
