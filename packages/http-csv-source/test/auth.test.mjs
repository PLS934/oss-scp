import { createServer } from 'node:http';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { collectHttpCsv } from '../dist/index.js';

let server;
let origin;
const received = [];

function definition(auth) {
  return {
    plugin: { id: 'auth-csv', name: 'Auth CSV', version: '0.1.0' },
    connection: { id: 'auth-csv', baseUrl: origin, auth },
    request: { transport: 'http', method: 'GET', path: '/records.csv', format: 'csv' },
    batching: { size: 10 },
    limits: { timeoutMs: 500, maxDownloadBytes: 4096, maxCsvBytes: 4096, maxRecordSize: 1024 },
  };
}

beforeAll(async () => {
  server = createServer((request, response) => {
    received.push(request.headers);
    response.end('id,name\n1,test\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => new Promise(resolve => server.close(resolve)));

test('HTTP CSV에도 Connection 인증 헤더를 적용한다', async () => {
  process.env.TEST_CSV_API_KEY = 'csv-secret';
  await collectHttpCsv(definition({ type: 'apiKey', header: 'X-CSV-Key', valueRef: { env: 'TEST_CSV_API_KEY' } }), () => {});
  expect(received.at(-1)['x-csv-key']).toBe('csv-secret');
  delete process.env.TEST_CSV_API_KEY;
});

test('HTTP CSV 인증 환경변수 누락은 요청 전에 실패한다', async () => {
  delete process.env.TEST_CSV_MISSING;
  const before = received.length;
  await expect(collectHttpCsv(definition({ type: 'bearer', tokenRef: { env: 'TEST_CSV_MISSING' } }), () => {}))
    .rejects.toMatchObject({ code: 'authentication', message: expect.stringContaining('TEST_CSV_MISSING') });
  expect(received).toHaveLength(before);
});
