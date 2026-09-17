import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';

export async function checkPluginHome(page, url, menus, root) {
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: '플러그인 목록', exact: true })).toBeVisible();
  await expect(main.locator('.plugin-card')).toHaveCount(5);
  const apiPlugins = await (await page.request.get(`${url}/api/v1/plugins`)).json();
  assert.equal(apiPlugins.length, 5);
  for (const plugin of apiPlugins) assert.equal(Object.keys(plugin).every(key => ['enabled', 'id', 'name', 'sourceType', 'endpoint', 'fileName', 'description'].includes(key)), true);
  await expect(main.getByText('http://127.0.0.1:3001/sample1', { exact: true })).toBeVisible();
  const localCard = main.locator('.plugin-card').filter({ hasText: 'Vulnerabilities Local CSV' });
  await expect(localCard.getByText('vulnerabilities.csv', { exact: true })).toBeVisible();
  await expect(main.getByRole('link', { name: '원본 내려받기', exact: true })).toHaveCount(1);
  await expect(localCard.locator('.plugin-file').getByRole('link', { name: '원본 내려받기' })).toBeVisible();
  await expect(main.getByText('현재 등록된 CSV 파일 원본입니다.')).toHaveCount(0);
  const downloaded = page.waitForEvent('download');
  await localCard.getByRole('link', { name: '원본 내려받기', exact: true }).click();
  const download = await downloaded;
  assert.equal(download.suggestedFilename(), 'vulnerabilities.csv');
  assert.deepEqual(await readFile(await download.path()), await readFile(path.join(root, 'fixtures/csv/vulnerabilities.csv')));

  const plugins = [
    { id: menus[0].pluginId, name: '자산 플러그인', description: '외부 API에서 서버 자산 정보를 제공합니다.', enabled: true, sourceType: 'http-json', endpoint: { url: 'https://api.example.test/assets', method: 'GET' } },
    { id: 'disabled', name: '비활성 CSV', enabled: false, sourceType: 'local-csv' },
    { id: 'no-menu', name: '메뉴 없는 플러그인', enabled: true, sourceType: 'http-csv' },
  ];
  let response = { json: plugins };
  const handler = route => route.fulfill(response);
  await page.route('**/api/v1/plugins', handler);
  const multipleMenus = route => route.fulfill({ json: [...menus, { ...menus[0], title: '추가 자산', path: '/extra-assets' }] });
  await page.route('**/api/v1/plugin-menus', multipleMenus);
  await page.reload();
  await expect(main.getByRole('link', { name: '자산 플러그인 · 서버 자산 데이터 보기' })).toHaveAttribute('href', '/assets/servers');
  await expect(main.getByRole('link', { name: '자산 플러그인 · 추가 자산 데이터 보기' })).toHaveAttribute('href', '/extra-assets');
  await expect(main.locator('.plugin-card').filter({ hasText: '비활성 CSV' }).getByRole('link')).toHaveCount(0);
  await expect(main.getByText('조회 가능한 메뉴가 없습니다.')).toBeVisible();
  await expect(main.getByText('등록된 설명이 없습니다.')).toHaveCount(0);
  await expect(main.locator('.plugin-description')).toHaveCount(1);
  await expect(main.locator('.plugin-title').getByRole('link')).toHaveCount(2);
  const sort = main.getByRole('button', { name: '이름 순', exact: true });
  await expect(sort).toHaveAttribute('aria-pressed', 'false');
  await sort.click();
  await expect(sort).toHaveAttribute('aria-pressed', 'true');
  await expect(main.locator('.plugin-card h3')).toHaveText(['메뉴 없는 플러그인', '비활성 CSV', '자산 플러그인']);
  await sort.click();
  await expect(sort).toHaveAttribute('aria-pressed', 'false');
  await expect(main.locator('.plugin-card h3')).toHaveText(plugins.map(plugin => plugin.name));

  await mkdir(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/plugin-home-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth), true);
  await page.screenshot({ path: path.join(root, 'test-results/plugin-home-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.unroute('**/api/v1/plugin-menus', multipleMenus);

  response = { json: [] };
  await page.reload();
  await expect(main.getByText('등록된 플러그인이 없습니다.')).toBeVisible();
  response = { status: 503, json: { password: 'never-render' } };
  await page.reload();
  await expect(main.getByRole('alert')).toContainText('플러그인 목록을 불러오지 못했습니다');
  await expect(main).not.toContainText('never-render');

  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const loadingHandler = async route => { await pending; await route.fulfill({ json: plugins }); };
  await page.route('**/api/v1/plugins', loadingHandler);
  await page.reload();
  await expect(main.getByRole('status')).toHaveText('플러그인 목록을 불러오는 중입니다.');
  release();
  await expect(main.locator('.plugin-card')).toHaveCount(3);
  await page.unroute('**/api/v1/plugins', loadingHandler);
  await page.unroute('**/api/v1/plugins', handler);
  await page.reload();
  await expect(main.locator('.plugin-card')).toHaveCount(5);
}
