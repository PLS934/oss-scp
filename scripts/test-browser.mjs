import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
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
    docker('exec', database, 'pg_isready', '-U', 'oss_scp_app', '-d', 'oss_scp');
    ready = true;
    break;
  } catch { await delay(100); }
}
assert.ok(ready, '브라우저 테스트용 PostgreSQL이 준비되지 않았습니다.');
const databaseAddress = docker('port', database, '5432/tcp');
const separator = databaseAddress.lastIndexOf(':');
const databaseEnv = {
  PLATFORM_DB_TYPE: 'postgres',
  PLATFORM_DB_HOST: databaseAddress.slice(0, separator),
  PLATFORM_DB_PORT: databaseAddress.slice(separator + 1),
  PLATFORM_DB_NAME: 'oss_scp',
  PLATFORM_DB_USER: 'oss_scp_app',
  PLATFORM_DB_PASSWORD: 'browser-password',
  PLATFORM_DB_TLS_MODE: 'disable',
};
const api = start(process.execPath, [path.join(root, 'apps/api/dist/main.js')], {
  env: { ...process.env, ...databaseEnv, PORT: String(apiPort), HOST: '127.0.0.1' },
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
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'OSS-SCP', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('서버 연결 성공');
  await page.evaluate(() => { document.documentElement.dataset.hmrCheck = 'same-document'; });
  const appFile = path.join(dir, 'apps/web/src/App.tsx');
  const original = await readFile(appFile, 'utf8');
  await writeFile(appFile, original.replace('<h1>OSS-SCP</h1>', '<h1>OSS-SCP HMR 확인</h1>'));
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

  collision = start('pnpm', args, { cwd: dir });
  const code = await Promise.race([collision.done, new Promise(resolve => setTimeout(() => resolve('timeout'), 10000))]);
  assert.notEqual(code, 'timeout');
  assert.notEqual(code, 0);
  assert.match(collision.output(), /already in use/);
  await stop(api);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('서버 연결 실패');
  await expect(page.getByRole('heading', { name: 'OSS-SCP HMR 확인', exact: true })).toBeVisible();
  console.log('브라우저: 시작 화면·로딩·성공·5초 실패·복구·실제 API 중단·404·사용자 지정 프록시·포트 충돌·HMR 통과');
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
