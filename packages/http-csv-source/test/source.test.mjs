import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { validateRepository } from '@oss-scp/plugin-config';
import { collectLocalCsv } from '@oss-scp/local-csv-source';
import { collectHttpCsv, HttpCsvSourceError } from '../dist/index.js';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const fixture = readFileSync(resolve(repositoryRoot, 'fixtures/csv/vulnerabilities.csv'));
let server;
let origin;
let sockets;

function definition(overrides = {}) {
  return {
    plugin: { id: 'test', name: 'Test', version: '0.1.0' },
    connection: { id: 'test', baseUrl: origin },
    request: { transport: 'http', method: 'GET', path: '/csv?token=NEVER_PRINT', format: 'csv' },
    batching: { size: 20 },
    limits: { timeoutMs: 1000, maxDownloadBytes: 2 * 1024 * 1024, maxCsvBytes: 2 * 1024 * 1024, maxRecordSize: 256 * 1024 },
    ...overrides,
  };
}

function send(response, body, headers = {}) {
  response.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', ...headers });
  response.end(body);
}

beforeAll(async () => {
  sockets = new Set();
  server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/status') {
      response.writeHead(503); response.end('PRIVATE RESPONSE'); return;
    }
    if (url.pathname === '/slow') {
      setTimeout(() => send(response, fixture), 250); return;
    }
    if (url.pathname === '/short') {
      response.writeHead(200, { 'content-length': fixture.length + 10, connection: 'close' });
      response.write(fixture);
      response.socket.end(); return;
    }
    if (url.pathname === '/cut') {
      response.writeHead(200, { 'transfer-encoding': 'chunked' });
      response.write('id,value\n1,a\n');
      setTimeout(() => response.socket.destroy(), 5); return;
    }
    if (url.pathname === '/malformed') return send(response, 'id,value\n1,"unfinished');
    if (url.pathname === '/record') return send(response, `id,value\n1,${'x'.repeat(5000)}\n`);
    if (url.pathname === '/other') return send(response, 'key,note\na,"x,y"\nb,"line 1\nline 2"\n');
    if (url.pathname === '/headers') return send(response, 'id,value\n');
    if (url.pathname === '/bad-gzip') return send(response, 'not gzip', { 'content-encoding': 'gzip' });
    if (url.pathname === '/unknown-encoding') return send(response, fixture, { 'content-encoding': 'compress' });
    if (url.pathname === '/gzip') return send(response, gzipSync(fixture), { 'content-encoding': 'gzip' });
    if (url.pathname === '/deflate') return send(response, deflateSync(fixture), { 'content-encoding': 'deflate' });
    if (url.pathname === '/br') return send(response, brotliCompressSync(fixture), { 'content-encoding': 'br' });
    send(response, fixture);
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise(resolvePromise => server.close(resolvePromise));
});

async function run(config = definition(), handler, options) {
  const batches = [];
  const summary = await collectHttpCsv(config, async batch => {
    batches.push(batch);
    await handler?.(batch);
  }, options);
  return { batches, summary };
}

async function expectCode(promise, code) {
  try {
    await promise;
    throw new Error('expected failure');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpCsvSourceError);
    expect(error.code).toBe(code);
    expect(error.message).not.toContain('NEVER_PRINT');
    expect(error.message).not.toContain('PRIVATE RESPONSE');
    expect(error.message).not.toContain('unfinished');
  }
}

describe('collectHttpCsv', () => {
  test('등록된 mock API에서 53행을 20·20·13 묶음으로 전달한다', async () => {
    const configuration = validateRepository(repositoryRoot);
    expect(configuration.ok).toBe(true);
    if (!configuration.ok) return;
    const configured = configuration.definitions.find(item => item.plugin.id === 'vulnerabilities-http-csv');
    const result = await run({ ...configured, connection: { ...configured.connection, baseUrl: origin } });
    expect(result.batches.map(batch => batch.records.length)).toEqual([20, 20, 13]);
    expect(result.batches.map(batch => batch.complete)).toEqual([false, false, true]);
    expect(result.summary).toEqual({ requests: 1, records: 53 });
    const records = result.batches.flatMap(batch => batch.records);
    expect(Object.keys(records[0])).toEqual(['cve', 'vul', 'test-data1', 'test-data2', 'test-data3', 'test-data4']);
    expect(records[0]['test-data2']).toBe('10.0');
    expect(records[0]['test-data4']).toBe('0.10');
  });

  test.each([['gzip', 'gzip'], ['deflate', 'deflate'], ['br', 'br']])('%s 압축을 스트리밍 해제한다', async (path) => {
    const result = await run(definition({ request: { transport: 'http', method: 'GET', path: `/${path}`, format: 'csv' } }));
    expect(result.summary.records).toBe(53);
  });

  test('헤더만 있는 응답은 빈 완료 묶음을 전달한다', async () => {
    const result = await run(definition({ request: { transport: 'http', method: 'GET', path: '/headers', format: 'csv' } }));
    expect(result.batches).toEqual([{ records: [], complete: true, signal: expect.any(AbortSignal) }]);
  });

  test('다른 경로·헤더와 따옴표 안 쉼표·줄바꿈을 보존한다', async () => {
    const result = await run(definition({ request: { transport: 'http', method: 'GET', path: '/other', format: 'csv' }, batching: { size: 1 } }));
    expect(result.batches.flatMap(batch => batch.records)).toEqual([
      { key: 'a', note: 'x,y' }, { key: 'b', note: 'line 1\nline 2' },
    ]);
  });

  test('로컬과 HTTP 결과가 순서·내용까지 같다', async () => {
    const configuration = validateRepository(repositoryRoot);
    if (!configuration.ok) throw new Error('invalid fixture config');
    const local = configuration.definitions.find(item => item.plugin.id === 'vulnerabilities-local-csv');
    const localRows = [];
    for await (const batch of collectLocalCsv(local)) localRows.push(...batch.records);
    const remote = await run();
    expect(remote.batches.flatMap(batch => batch.records)).toEqual(localRows);
  });

  test('HTTP·형식·압축 오류를 안전한 코드로 구분한다', async () => {
    await expectCode(run(definition({ request: { transport: 'http', method: 'GET', path: '/status?token=NEVER_PRINT', format: 'csv' } })), 'http_status');
    await expectCode(run(definition({ request: { transport: 'http', method: 'GET', path: '/malformed', format: 'csv' } })), 'invalid_csv');
    await expectCode(run(definition({ request: { transport: 'http', method: 'GET', path: '/bad-gzip', format: 'csv' } })), 'invalid_compression');
    await expectCode(run(definition({ request: { transport: 'http', method: 'GET', path: '/unknown-encoding', format: 'csv' } })), 'unsupported_encoding');
  });

  test('전송·해제 후·레코드 한도를 각각 적용한다', async () => {
    await expectCode(run(definition({ limits: { timeoutMs: 1000, maxDownloadBytes: 100, maxCsvBytes: 10000, maxRecordSize: 10000 } })), 'download_too_large');
    await expectCode(run(definition({ request: { transport: 'http', method: 'GET', path: '/gzip', format: 'csv' }, limits: { timeoutMs: 1000, maxDownloadBytes: 10000, maxCsvBytes: 100, maxRecordSize: 100 } })), 'csv_too_large');
    await expectCode(run(definition({ request: { transport: 'http', method: 'GET', path: '/record', format: 'csv' }, limits: { timeoutMs: 1000, maxDownloadBytes: 10000, maxCsvBytes: 10000, maxRecordSize: 100 } })), 'record_too_large');
  });

  test('길이 불일치와 Content-Length 없는 중도 종료를 구분한다', async () => {
    await expectCode(run(definition({ request: { transport: 'http', method: 'GET', path: '/short', format: 'csv' } })), 'length_mismatch');
    await expectCode(run(definition({ request: { transport: 'http', method: 'GET', path: '/cut', format: 'csv' } })), 'incomplete_download');
  });

  test('timeout·취소·묶음 처리 실패를 구분한다', async () => {
    await expectCode(run(definition({ request: { transport: 'http', method: 'GET', path: '/slow', format: 'csv' }, limits: { timeoutMs: 100, maxDownloadBytes: 10000, maxCsvBytes: 10000, maxRecordSize: 1000 } })), 'timeout');
    const controller = new AbortController();
    const pending = run(definition({ request: { transport: 'http', method: 'GET', path: '/slow', format: 'csv' } }), undefined, { signal: controller.signal });
    controller.abort();
    await expectCode(pending, 'cancelled');
    await expectCode(run(definition(), () => { throw new Error('PRIVATE PROCESSING'); }), 'processing');
    await expectCode(run(definition({ request: { transport: 'http', method: 'GET', path: '/headers', format: 'csv' } }), () => { throw new Error('PRIVATE EMPTY'); }), 'processing');

    const processingAbort = new AbortController();
    await expectCode(run(definition(), ({ signal }) => {
      processingAbort.abort();
      expect(signal.aborted).toBe(true);
    }, { signal: processingAbort.signal }), 'cancelled');
  });

  test('느린 소비가 끝날 때까지 다음 묶음과 완료를 앞당기지 않는다', async () => {
    let release;
    const gate = new Promise(resolvePromise => { release = resolvePromise; });
    let calls = 0;
    const pending = run(definition({ batching: { size: 1 } }), async () => {
      calls += 1;
      if (calls === 1) await gate;
    });
    await new Promise(resolvePromise => setTimeout(resolvePromise, 30));
    expect(calls).toBe(1);
    release();
    await expect(pending).resolves.toMatchObject({ summary: { records: 53 } });
  });

  test('실패 후 요청 소켓을 정리한다', async () => {
    await expectCode(run(definition({ request: { transport: 'http', method: 'GET', path: '/malformed', format: 'csv' } })), 'invalid_csv');
    await new Promise(resolvePromise => setTimeout(resolvePromise, 20));
    expect(sockets.size).toBe(0);
  });
});

test('행이 10배여도 완료 묶음을 heap에 누적하지 않는다', () => {
  const worker = resolve(import.meta.dirname, 'memory-worker.mjs');
  const measure = rows => {
    const result = spawnSync(process.execPath, ['--expose-gc', worker, String(rows)], {
      encoding: 'utf8', timeout: 30_000,
    });
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout).increase;
  };
  const small = measure(2_000);
  const large = measure(20_000);
  expect(large).toBeLessThanOrEqual(Math.max(small * 3, small + 20 * 1024 * 1024));
});
