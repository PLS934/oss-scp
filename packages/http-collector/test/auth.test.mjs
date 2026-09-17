import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { collectHttpSingle, HttpCollectorError } from '../dist/index.js';

let server;
let origin;
const received = [];

function definition(auth) {
  return {
    plugin: { id: 'auth', name: 'Auth', version: '0.1.0' },
    connection: { id: 'auth', baseUrl: origin, auth },
    request: { method: 'GET', path: '/records', format: 'json' },
    response: { itemsPath: 'items' },
    pagination: { type: 'single' },
    limits: { timeoutMs: 500, maxResponseBytes: 4096, maxRecordBytes: 1024 },
  };
}

beforeAll(async () => {
  server = createServer((request, response) => {
    received.push(request.headers);
    if (request.headers.authorization === 'Bearer never-print-this-secret') {
      response.writeHead(401);
      response.end('authentication rejected');
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end('{"items":[{"id":1}]}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => new Promise(resolve => server.close(resolve)));

describe('HTTP JSON authentication', () => {
  test.each([
    [{ type: 'apiKey', header: 'X-API-Key', valueRef: { env: 'TEST_SOURCE_API_KEY' } }, { TEST_SOURCE_API_KEY: 'key-secret' }, 'x-api-key', 'key-secret'],
    [{ type: 'bearer', tokenRef: { env: 'TEST_SOURCE_TOKEN' } }, { TEST_SOURCE_TOKEN: 'token-secret' }, 'authorization', 'Bearer token-secret'],
    [{ type: 'basic', usernameRef: { env: 'TEST_SOURCE_USER' }, passwordRef: { env: 'TEST_SOURCE_PASSWORD' } }, { TEST_SOURCE_USER: 'collector', TEST_SOURCE_PASSWORD: 'password-secret' }, 'authorization', `Basic ${Buffer.from('collector:password-secret').toString('base64')}`],
  ])('환경변수로 인증 헤더를 구성한다', async (auth, environment, header, expected) => {
    Object.assign(process.env, environment);
    await collectHttpSingle(definition(auth), () => {});
    expect(received.at(-1)[header]).toBe(expected);
    for (const name of Object.keys(environment)) delete process.env[name];
  });

  test.each([undefined, ''])('필수 환경변수가 %s이면 요청 전에 안전하게 실패한다', async value => {
    const name = 'TEST_MISSING_SOURCE_TOKEN';
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
    const before = received.length;
    await expect(collectHttpSingle(definition({ type: 'bearer', tokenRef: { env: name } }), () => {}))
      .rejects.toMatchObject({ code: 'authentication', message: expect.stringContaining(name) });
    expect(received).toHaveLength(before);
  });

  test('인증 실패 오류에 비밀값을 포함하지 않는다', async () => {
    process.env.TEST_REJECTED_TOKEN = 'never-print-this-secret';
    try {
      await collectHttpSingle(definition({ type: 'bearer', tokenRef: { env: 'TEST_REJECTED_TOKEN' } }), () => {});
    } catch (error) {
      expect(error).toBeInstanceOf(HttpCollectorError);
      expect(error.code).toBe('http_status');
      expect(String(error)).not.toContain('never-print-this-secret');
    } finally {
      delete process.env.TEST_REJECTED_TOKEN;
    }
  });
});
