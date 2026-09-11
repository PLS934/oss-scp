import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import { chromium, expect } from '@playwright/test';
import { root, fixture, port, start, stop, waitFor, healthy, delay } from './web-test-helpers.mjs';

const dir = await fixture(true);
const apiPort = await port();
const webPort = await port();
const url = `http://127.0.0.1:${webPort}`;
const database = `oss-scp-browser-db-${process.pid}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
docker('run', '-d', '--name', database, '-e', 'POSTGRES_DB=oss_scp', '-e', 'POSTGRES_USER=oss_scp_app',
  '-e', 'POSTGRES_PASSWORD=browser-password', '-p', '127.0.0.1::5432', 'postgres:17.6-bookworm');
let ready = false;
for (let attempt = 0; attempt < 100; attempt++) {
  try {
    docker('exec', '-e', 'PGPASSWORD=browser-password', database,
      'psql', '-h', '127.0.0.1', '-U', 'oss_scp_app', '-d', 'oss_scp', '-Atc', 'SELECT 1');
    ready = true;
    break;
  } catch { await delay(100); }
}
assert.ok(ready, '브라우저 테스트용 PostgreSQL이 준비되지 않았습니다.');
const databaseAddress = docker('port', database, '5432/tcp');
const separator = databaseAddress.lastIndexOf(':');
const databaseHost = databaseAddress.slice(0, separator);
const databasePort = databaseAddress.slice(separator + 1);
await waitFor(() => new Promise(resolve => {
  const socket = createConnection({ host: databaseHost, port: Number(databasePort) });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
  socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
}), '브라우저 테스트용 PostgreSQL 공개 포트');
const databaseEnv = {
  PLATFORM_DB_TYPE: 'postgres',
  PLATFORM_DB_HOST: databaseHost,
  PLATFORM_DB_PORT: databasePort,
  PLATFORM_DB_NAME: 'oss_scp',
  PLATFORM_DB_USER: 'oss_scp_app',
  PLATFORM_DB_PASSWORD: 'browser-password',
  PLATFORM_DB_TLS_MODE: 'disable',
};
const api = start(process.execPath, [path.join(root, 'apps/api/dist/main.js')], {
  env: { ...process.env, ...databaseEnv, OSS_SCP_CONFIG_ROOT: root, PORT: String(apiPort), HOST: '127.0.0.1' },
});
let web;
let browser;
let collision;
try {
  await waitFor(() => healthy(`http://127.0.0.1:${apiPort}`), 'API');
  const args = ['--filter', '@oss-scp/web', 'dev', '--port', String(webPort)];
  web = start('pnpm', args, { cwd: dir, env: { ...process.env, API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` } });
  await waitFor(() => healthy(url), 'Vite 프록시');
  assert.equal((await fetch(`${url}/api/not-found`)).status, 404);
  const addresses = Object.values(networkInterfaces()).flat().filter(address => address?.family === 'IPv4' && !address.internal);
  for (const address of addresses) {
    await assert.rejects(fetch(`http://${address.address}:${webPort}/`, { signal: AbortSignal.timeout(2000) }));
  }
  browser = await chromium.launch();
  const page = await browser.newPage();
  const browserMenus = [
    { title: '서버 자산', icon: 'server', group: '자산 관리', order: 10, path: '/assets/servers', dataType: 'asset', pluginId: 'sample1-offset-api', sourceId: 'mock-api-sample1', list: { columns: [{ key: 'hostname', label: '호스트명', type: 'string' }, { key: 'score', label: '점수', type: 'number' }, { key: 'enabled', label: '활성', type: 'boolean' }, { key: 'observedAt', label: '관측 시각', type: 'datetime' }] }, detail: { sections: [{ title: '기본 정보', fields: [{ key: 'hostname', label: '호스트명', type: 'string' }] }] } },
    { title: '저장소', icon: 'repository', group: '자산 관리', order: 20, path: '/assets/repositories', dataType: 'repository', pluginId: 'sample2-single-api', sourceId: 'mock-api-sample2', list: { columns: [{ key: 'fullName', label: '저장소 전체 이름', type: 'string' }] }, detail: { sections: [{ title: '기본 정보', fields: [{ key: 'fullName', label: '저장소 전체 이름', type: 'string' }] }] } },
  ];
  const recordRequests = [];
  const detailRequests = [];
  let sourceRequests = 0;
  page.on('request', request => {
    const requestUrl = new URL(request.url());
    if (['/sample1', '/sample2', '/vulnerabilities.csv'].includes(requestUrl.pathname)) sourceRequests += 1;
  });
  await page.route('**/api/v1/plugin-menus', route => route.fulfill({ json: browserMenus }));
  await page.route('**/api/v1/records/*', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1);
    detailRequests.push(id);
    if (id === '00000000-0000-4000-8000-000000000404') {
      await route.fulfill({ status: 404, json: { code: 'RECORD_NOT_FOUND', message: 'private server text' } });
      return;
    }
    if (id === '00000000-0000-4000-8000-000000000500') {
      await route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR', message: 'private server text' } });
      return;
    }
    const mismatch = id === '00000000-0000-4000-8000-000000000403';
    await route.fulfill({ json: {
      id, pluginId: mismatch ? 'sample1-offset-api' : 'sample2-single-api',
      sourceId: mismatch ? 'mock-api-sample1' : 'mock-api-sample2', dataType: mismatch ? 'asset' : 'repository',
      externalKey: 'source-visible-key', sourceValues: { fullName: '<b>example/another-repository</b>', secret: 'never-render' },
      firstSeenAt: '2026-09-11T01:00:00.000Z', lastSeenAt: '2026-09-11T01:01:00.000Z',
    } });
  });
  await page.route('**/api/v1/records?*', async route => {
    const requestUrl = new URL(route.request().url());
    const pluginId = requestUrl.searchParams.get('pluginId');
    const limit = Number(requestUrl.searchParams.get('limit') ?? 20);
    const cursor = requestUrl.searchParams.get('cursor');
    recordRequests.push({ pluginId, limit, cursor });
    if (cursor === 'cursor-50') await delay(300);
    const start = cursor ? Number(cursor.slice('cursor-'.length)) : 0;
    const total = pluginId === 'sample1-offset-api' ? 72 : 1;
    const rows = Array.from({ length: Math.min(limit, total - start) }, (_, index) => {
      const number = start + index + 1;
      return {
        id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
        pluginId, sourceId: pluginId === 'sample1-offset-api' ? 'mock-api-sample1' : 'mock-api-sample2',
        dataType: pluginId === 'sample1-offset-api' ? 'asset' : 'repository', externalKey: `key-${number}`,
        sourceValues: pluginId === 'sample1-offset-api'
          ? { hostname: `test-host-${number}`, score: number * 1000, enabled: number % 2 === 1, observedAt: '2026-09-11T01:00:00.000Z', secret: 'never-render' }
          : { fullName: 'example/another-repository', secret: 'never-render' },
        firstSeenAt: '2026-09-11T01:00:00.000Z', lastSeenAt: '2026-09-11T01:01:00.000Z', omittedFields: ['details'],
      };
    });
    const hasNextPage = start + rows.length < total;
    await route.fulfill({ json: {
      items: rows, pageInfo: { nextCursor: hasNextPage ? `cursor-${start + rows.length}` : null, hasNextPage },
      collection: { scope: 'source', status: 'success', runId: '00000000-0000-4000-8000-000000009999', startedAt: '2026-09-11T01:00:00.000Z', finishedAt: '2026-09-11T01:02:00.000Z' },
      lastStoredAt: '2026-09-11T01:01:00.000Z',
    } });
  });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'OSS-SCP', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('서버 연결 성공');
  await page.getByRole('link', { name: /서버 자산/ }).click();
  await expect(page.getByRole('heading', { name: '서버 자산', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '호스트명' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'test-host-1', exact: true })).toBeVisible();
  await expect(page.getByText('20개 항목')).toBeVisible();
  await page.getByRole('button', { name: '다음 묶음' }).click();
  await expect(page.getByRole('cell', { name: 'test-host-21', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'test-host-1', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '다음 묶음' }).click();
  await page.getByRole('button', { name: '다음 묶음' }).click();
  await expect(page.getByRole('cell', { name: 'test-host-72', exact: true })).toBeVisible();
  await expect(page.getByText('마지막 묶음입니다.')).toBeVisible();
  await page.getByLabel('묶음 크기').selectOption('50');
  await expect(page.getByRole('cell', { name: 'test-host-1', exact: true })).toBeVisible();
  assert.deepEqual(recordRequests.at(-1), { pluginId: 'sample1-offset-api', limit: 50, cursor: null });
  await page.getByRole('button', { name: '다음 묶음' }).click();
  await page.getByRole('link', { name: /저장소/ }).click();
  await expect(page.getByRole('heading', { name: '저장소', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '저장소 전체 이름' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'example/another-repository' })).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page.getByRole('cell', { name: 'example/another-repository' })).toBeVisible();
  await expect(page.getByText('test-host-51')).toHaveCount(0);
  await expect(page.getByText('never-render')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('cell', { name: 'example/another-repository' })).toBeVisible();
  await page.getByRole('link', { name: '보기' }).click();
  await expect(page).toHaveURL(`${url}/assets/repositories/00000000-0000-4000-8000-000000000001`);
  await expect(page.getByRole('heading', { name: '저장소 상세' })).toBeVisible();
  await expect(page.getByText('<b>example/another-repository</b>')).toBeVisible();
  await expect(page.locator('b')).toHaveCount(0);
  await expect(page.getByText('never-render')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: '저장소 상세' })).toBeVisible();
  await page.getByRole('link', { name: '목록으로 돌아가기' }).click();
  await expect(page.getByRole('cell', { name: 'example/another-repository' })).toBeVisible();

  const beforeInvalid = detailRequests.length;
  await page.goto(`${url}/assets/repositories/not-a-uuid`);
  await expect(page.getByRole('heading', { name: '잘못된 레코드 ID입니다.' })).toBeVisible();
  assert.equal(detailRequests.length, beforeInvalid, '잘못된 UUID가 상세 API를 호출했습니다.');
  await page.goto(`${url}/assets/repositories/00000000-0000-4000-8000-000000000404`);
  await expect(page.getByRole('heading', { name: '저장 레코드를 찾을 수 없습니다.' })).toBeVisible();
  await expect(page.getByText('private server text')).toHaveCount(0);
  await page.goto(`${url}/assets/repositories/00000000-0000-4000-8000-000000000403`);
  await expect(page.getByRole('heading', { name: '현재 플러그인에 속한 레코드가 아닙니다.' })).toBeVisible();
  await expect(page.getByText('source-visible-key')).toHaveCount(0);
  await page.goto(`${url}/assets/repositories/00000000-0000-4000-8000-000000000500`);
  await expect(page.getByRole('heading', { name: '상세 정보를 불러오지 못했습니다.' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expect(page.getByText('private server text')).toHaveCount(0);
  assert.equal(sourceRequests, 0, '브라우저 목록이 원천 API를 호출했습니다.');
  await page.goto(`${url}/removed-plugin`);
  await expect(page.getByRole('heading', { name: '페이지를 찾을 수 없습니다' })).toBeVisible();
  await page.goto(url);
  await page.evaluate(() => { document.documentElement.dataset.hmrCheck = 'same-document'; });
  const appFile = path.join(dir, 'apps/web/src/App.tsx');
  const original = await readFile(appFile, 'utf8');
  await writeFile(appFile, original.replace('OSS-SCP</NavLink>', 'OSS-SCP HMR 확인</NavLink>'));
  await expect(page.getByRole('heading', { name: 'OSS-SCP HMR 확인', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.hmrCheck), 'same-document');

  // 응답을 보류해 로딩을 관찰한 다음 5초 제한 시간으로 실패하는지 확인한다.
  await page.route('**/api/v1/health', () => {});
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('서버 연결 확인 중');
  await expect(page.getByRole('status')).toHaveText('서버 연결 실패', { timeout: 7000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('서버 연결 성공');

  const collisionArgs = ['--filter', '@oss-scp/web', 'exec', 'vite', '--port', String(webPort), '--strictPort'];
  collision = start('pnpm', collisionArgs, { cwd: dir });
  const code = await Promise.race([collision.done, new Promise(resolve => setTimeout(() => resolve('timeout'), 10000))]);
  assert.notEqual(code, 'timeout');
  assert.notEqual(code, 0);
  assert.match(collision.output(), /already in use/);
  await stop(api);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('서버 연결 실패');
  await expect(page.getByRole('heading', { name: 'OSS-SCP HMR 확인', exact: true })).toBeVisible();
  console.log('브라우저: 선언형 목록·상세 이동·직접 URL·새로고침·복귀·상세 오류·cursor·묶음 크기·플러그인 재사용·원천 미호출·not-found·health·API 404·포트 충돌·HMR 통과');
} catch (error) {
  console.error(api.output(), web?.output());
  throw error;
} finally {
  await browser?.close();
  await stop(collision);
  await stop(web);
  await stop(api);
  await rm(dir, { recursive: true, force: true });
  try { docker('rm', '-f', database); } catch { /* 테스트 DB가 이미 종료됐을 수 있다. */ }
}
