import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, readConfig, loadFixtures } from '../dist/app.js';
import {
  readFileSync,
  cpSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(3000),
  });
}

const original = new URL('../../../fixtures/', import.meta.url);
const json = (name) =>
  JSON.parse(readFileSync(new URL(`sources/${name}.json`, original)));
const csv = readFileSync(new URL('csv/vulnerabilities.csv', original));
let app, url;
beforeAll(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
});
describe('원천 HTTP 계약', () => {
  it('네 페이지가 원본 72건과 순서까지 일치한다', async () => {
    const rows = [];
    for (const [offset, size] of [
      [0, 20],
      [20, 20],
      [40, 20],
      [60, 12],
    ]) {
      const res = await fetchWithTimeout(
        `${url}/sample1?offset=${offset}&limit=20`,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      const page = await res.json();
      expect(page.total).toBe(72);
      expect(page.rows).toHaveLength(size);
      rows.push(...page.rows);
    }
    expect(rows).toEqual(json('sample1').rows);
  });
  it.each([
    ['', 72],
    ['?limit=1', 1],
    ['?limit=1000', 72],
    ['?offset=60', 12],
    ['?offset=72', 0],
    ['?offset=999', 0],
    ['?offset=9007199254740991', 0],
  ])('기본값·경계 %s', async (query, size) => {
    const res = await fetchWithTimeout(`${url}/sample1${query}`);
    expect(res.status).toBe(200);
    const page = await res.json();
    expect(page.total).toBe(72);
    expect(page.rows).toHaveLength(size);
  });
  it.each([
    'offset=-1',
    'offset=1.5',
    'offset=abc',
    'limit=0',
    'limit=1001',
    'limit=',
    'offset=',
    'limit=1e2',
    'offset=0x10',
    'offset=%200',
    'offset=9007199254740992',
    'limit=1&limit=2',
    'offset=0&offset=1',
    'limit[]=1',
    'offset[a]=1',
  ])('잘못된 입력 %s', async (query) => {
    const res = await fetchWithTimeout(`${url}/sample1?${query}`);
    expect(res.status).toBe(400);
    expect((await res.json()).statusCode).toBe(400);
    expect((await fetchWithTimeout(`${url}/sample1`)).status).toBe(200);
  });
  it('전체 JSON의 중첩 값과 최상위 필드를 유지한다', async () => {
    const res = await fetchWithTimeout(`${url}/sample2?limit=1`);
    expect(res.status).toBe(200);
    const value = await res.json();
    expect(value).toEqual(json('sample2'));
    expect(value.items).toHaveLength(153);
  });
  it('CSV 원본 바이트와 다운로드 헤더를 보존한다', async () => {
    const res = await fetchWithTimeout(`${url}/vulnerabilities.csv`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="vulnerabilities.csv"',
    );
    expect(Buffer.from(await res.arrayBuffer())).toEqual(csv);
    expect(csv.toString().trim().split('\n')).toHaveLength(54);
  });
  it('없는 경로는 404이고 정상 경로는 유지된다', async () => {
    const res = await fetchWithTimeout(`${url}/missing`);
    expect(res.status).toBe(404);
    expect((await res.json()).statusCode).toBe(404);
    for (const path of ['sample1', 'sample2', 'vulnerabilities.csv'])
      expect((await fetchWithTimeout(`${url}/${path}`)).status).toBe(200);
  });
});
describe('시작 검증', () => {
  it('기본 설정과 사용자 설정', () => {
    expect(readConfig({})).toEqual({ host: '127.0.0.1', port: 3001 });
    expect(readConfig({ MOCK_HOST: '0.0.0.0', MOCK_PORT: '4321' })).toEqual({
      host: '0.0.0.0',
      port: 4321,
    });
  });
  it.each(['', '0', '-1', '1.5', '65536', 'abc', '1e3', ' 3001'])(
    '포트 %s 거부',
    (value) =>
      expect(() => readConfig({ MOCK_PORT: value })).toThrow('MOCK_PORT'),
  );
  it('복사된 fixture도 원본과 같다', () => {
    expect(loadFixtures().sample1).toEqual(json('sample1'));
    expect(loadFixtures().sample2).toEqual(json('sample2'));
    expect(loadFixtures().csv).toEqual(csv);
  });
  it.each(['missing', 'json', 'total', 'items', 'csv'])(
    'fixture 오류 %s',
    (kind) => {
      const dir = mkdtempSync(join(tmpdir(), 'mock-fixture-'));
      try {
        cpSync(original, dir, { recursive: true });
        if (kind === 'missing') rmSync(join(dir, 'sources/sample1.json'));
        if (kind === 'json')
          writeFileSync(join(dir, 'sources/sample1.json'), '{');
        if (kind === 'total')
          writeFileSync(
            join(dir, 'sources/sample1.json'),
            '{"total":2,"rows":[]}',
          );
        if (kind === 'items')
          writeFileSync(join(dir, 'sources/sample2.json'), '{}');
        if (kind === 'csv') rmSync(join(dir, 'csv/vulnerabilities.csv'));
        expect(() => loadFixtures(dir)).toThrow();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
async function runFailure(main, env) {
  const child = spawn(process.execPath, [main], {
    cwd: tmpdir(),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (b) => (output += b));
  child.stderr.on('data', (b) => (output += b));
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  try {
    const code = await new Promise((resolve) => child.on('exit', resolve));
    expect(code).toBe(1);
    expect(output).not.toContain('Mock API ready');
  } finally {
    clearTimeout(timer);
    child.kill();
  }
}
it('다른 cwd의 실제 프로세스가 잘못된 포트와 포트 점유를 거부한다', async () => {
  const main = fileURLToPath(new URL('../dist/main.js', import.meta.url));
  await runFailure(main, { MOCK_PORT: 'invalid' });
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await runFailure(main, {
      MOCK_PORT: String(server.address().port),
      MOCK_HOST: '127.0.0.1',
    });
  } finally {
    server.close();
  }
});
it('fixture 누락은 실제 프로세스 시작을 실패시킨다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mock-start-'));
  try {
    cpSync(new URL('../dist/', import.meta.url), join(dir, 'dist'), {
      recursive: true,
    });
    symlinkSync(
      fileURLToPath(new URL('../node_modules', import.meta.url)),
      join(dir, 'node_modules'),
      'dir',
    );
    rmSync(join(dir, 'dist/fixtures/sources/sample1.json'));
    await runFailure(join(dir, 'dist/main.js'), { MOCK_PORT: '3001' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
