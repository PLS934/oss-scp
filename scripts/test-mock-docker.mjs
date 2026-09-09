import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fixture, port, run, waitFor, healthy } from './web-test-helpers.mjs';

function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(3000),
  });
}

const dir = await fixture();
const project = `oss-scp-mock-check-${process.pid}`;
const standalone = `${project}-standalone`;
const mockPort = await port();
const webPort = await port();
const env = {
  ...process.env,
  MOCK_PUBLISHED_PORT: String(mockPort),
  WEB_PORT: String(webPort),
  API_PORT: String(await port()),
};
delete env.COMPOSE_PROFILES;
const docker = (args) => run('docker', args, { cwd: dir, env });
const compose = (args, dev = false, profile = true) =>
  docker([
    'compose',
    '-p',
    project,
    '-f',
    'compose.yaml',
    ...(dev ? ['-f', 'compose.dev.yaml'] : []),
    ...(profile ? ['--profile', 'mock'] : []),
    ...args,
  ]);
const mockUrl = `http://127.0.0.1:${mockPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
async function contract(url) {
  const sample1 = JSON.parse(
    await readFile(path.join(dir, 'fixtures/sources/sample1.json')),
  );
  const sample2 = JSON.parse(
    await readFile(path.join(dir, 'fixtures/sources/sample2.json')),
  );
  const csv = await readFile(
    path.join(dir, 'fixtures/csv/vulnerabilities.csv'),
  );
  const rows = [];
  for (const [offset, size] of [
    [0, 20],
    [20, 20],
    [40, 20],
    [60, 12],
  ]) {
    const r = await fetchWithTimeout(
      `${url}/sample1?offset=${offset}&limit=20`,
    );
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.total, 72);
    assert.equal(body.rows.length, size);
    rows.push(...body.rows);
  }
  assert.deepEqual(rows, sample1.rows);
  assert.deepEqual(
    await (await fetchWithTimeout(`${url}/sample1`)).json(),
    sample1,
  );
  assert.deepEqual(
    await (await fetchWithTimeout(`${url}/sample1?offset=72`)).json(),
    { total: 72, rows: [] },
  );
  assert.deepEqual(
    await (await fetchWithTimeout(`${url}/sample2`)).json(),
    sample2,
  );
  const r = await fetchWithTimeout(`${url}/vulnerabilities.csv`);
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(
    r.headers.get('content-disposition'),
    'attachment; filename="vulnerabilities.csv"',
  );
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), csv);
  for (const query of [
    'limit=0',
    'offset=-1',
    'offset=1.5',
    'limit=abc',
    'limit=1001',
    'limit=1&limit=2',
    'limit[]=1',
  ])
    assert.equal(
      (await fetchWithTimeout(`${url}/sample1?${query}`)).status,
      400,
    );
  assert.equal((await fetchWithTimeout(`${url}/missing`)).status, 404);
}
async function verifyStandalone() {
  assert.deepEqual(
    (await compose(['config', '--services'], false, false))
      .trim()
      .split('\n')
      .sort(),
    ['api', 'web'],
  );
  const config = JSON.parse(await compose(['config', '--format', 'json']));
  assert.equal(config.services['mock-api'].ports[0].host_ip, '127.0.0.1');
  assert.equal(
    String(config.services['mock-api'].ports[0].published),
    String(mockPort),
  );
  await compose([
    'up',
    '--build',
    '-d',
    '--wait',
    '--wait-timeout',
    '180',
    'mock-api',
  ]);
  assert.equal(
    (await compose(['ps', '--services', '--status', 'running'])).trim(),
    'mock-api',
  );
  await contract(mockUrl);
  console.log('mock 단독 Compose 계약 통과');
  await docker([
    'run',
    '-d',
    '--name',
    standalone,
    '-p',
    '127.0.0.1::3001',
    'oss-scp-mock-api:local',
  ]);
  const address = (await docker(['port', standalone, '3001/tcp'])).trim();
  await waitFor(
    async () =>
      JSON.parse(await docker(['inspect', standalone]))[0].State.Health
        .Status === 'healthy',
    '이미지 health',
  );
  const inspection = JSON.parse(await docker(['inspect', standalone]))[0];
  assert.equal(inspection.Mounts.length, 0);
  assert.equal(inspection.Config.User, 'node');
  await contract(`http://${address}`);
  await docker(['rm', '-f', standalone]);
  console.log('볼륨 없는 이미지 계약 통과');
}

async function verifyIntegration() {
  await compose(['up', '--build', '-d', '--wait', '--wait-timeout', '180']);
  assert.deepEqual(
    (await compose(['ps', '--services', '--status', 'running']))
      .trim()
      .split('\n')
      .sort(),
    ['api', 'mock-api', 'web'],
  );
  await waitFor(() => healthy(webUrl), '웹 프록시');
  await compose([
    'exec',
    '-T',
    'api',
    'node',
    '-e',
    "fetch('http://mock-api:3001/sample2', {signal: AbortSignal.timeout(3000)}).then(async r=>{if(r.status!==200 || (await r.json()).items.length!==153)process.exit(1)}).catch(()=>process.exit(1))",
  ]);
  await compose(['stop', 'mock-api']);
  await waitFor(() => healthy(webUrl), 'mock 중단 후 기존 API');
  await compose(['down', '--volumes', '--remove-orphans']);
  await compose(['up', '-d', '--wait', '--wait-timeout', '180'], false, false);
  assert.deepEqual(
    (await compose(['ps', '--services', '--status', 'running'], false, false))
      .trim()
      .split('\n')
      .sort(),
    ['api', 'web'],
  );
  await waitFor(() => healthy(webUrl), 'mock 없는 기본 실행');
  await compose(['down', '--volumes', '--remove-orphans']);
  console.log('3개 서비스·내부 통신·mock 선택 해제 통과');
}

async function verifyDevelopment() {
  await compose(
    ['up', '--build', '-d', '--wait', '--wait-timeout', '240'],
    true,
  );
  await contract(mockUrl);
  await waitFor(() => healthy(webUrl), '개발 웹 프록시');
  const ids = await compose(['ps', '-q'], true);
  const source = path.join(dir, 'apps/mock-api/src/app.ts');
  const original = await readFile(source, 'utf8');
  await writeFile(
    source,
    original.replace("@Get('sample2')", "@Get('sample2-changed')"),
  );
  await waitFor(
    async () => (await fetchWithTimeout(`${mockUrl}/sample2-changed`)).ok,
    'mock 소스 변경',
    60000,
  );
  await writeFile(source, original);
  await waitFor(
    async () => (await fetchWithTimeout(`${mockUrl}/sample2`)).ok,
    'mock 소스 복구',
    60000,
  );
  const sample = path.join(dir, 'fixtures/sources/sample2.json');
  const content = JSON.parse(await readFile(sample));
  content.test_field6 = !content.test_field6;
  await writeFile(sample, JSON.stringify(content));
  await waitFor(
    async () =>
      (await (await fetchWithTimeout(`${mockUrl}/sample2`)).json())
        .test_field6 === content.test_field6,
    'fixture 변경',
    60000,
  );
  assert.equal(await compose(['ps', '-q'], true), ids);
  await waitFor(() => healthy(webUrl), '개발 기존 API 유지');
  console.log('Docker 개발 소스·fixture 자동 반영 통과');
  await compose(['stop', 'mock-api'], true);
  await rm(path.join(dir, 'fixtures/csv/vulnerabilities.csv'));
  await compose(['start', 'mock-api'], true);
  const mockId = (await compose(['ps', '-aq', 'mock-api'], true)).trim();
  await waitFor(
    async () => {
      const state = JSON.parse(await docker(['inspect', mockId]))[0].State;
      return state.Status === 'exited' && state.ExitCode !== 0;
    },
    'fixture 누락 시 개발 컨테이너 오류 종료',
    60000,
  );
  await waitFor(() => healthy(webUrl), 'mock 시작 실패 후 기존 API 유지');
  console.log('fixture 누락 시 Docker 개발 오류 종료 통과');
}

try {
  await verifyStandalone();
  await verifyIntegration();
  await verifyDevelopment();
} finally {
  await docker(['rm', '-f', standalone]).catch(() => {});
  await compose(['down', '--volumes', '--remove-orphans'], true);
  assert.equal(
    (
      await docker([
        'ps',
        '-aq',
        '--filter',
        `label=com.docker.compose.project=${project}`,
      ])
    ).trim(),
    '',
  );
  assert.equal(
    (
      await docker([
        'volume',
        'ls',
        '-q',
        '--filter',
        `label=com.docker.compose.project=${project}`,
      ])
    ).trim(),
    '',
  );
  await rm(dir, { recursive: true, force: true });
}
console.log('mock Docker 검증 완료');
