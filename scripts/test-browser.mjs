import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import { chromium, expect } from '@playwright/test';
import { root, fixture, port, start, stop, waitFor, healthy } from './web-test-helpers.mjs';

const dir = await fixture(true);
const apiPort = await port();
const webPort = await port();
const url = `http://127.0.0.1:${webPort}`;
const api = start(process.execPath, [path.join(root, 'apps/api/dist/main.js')], {
  env: { ...process.env, PORT: String(apiPort), HOST: '127.0.0.1' },
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
}
