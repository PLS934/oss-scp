import { URLSearchParams } from 'node:url';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

// 테스트 DB 또는 기존 수집 DB에서 읽기만 수행한다.
export async function testAssetSearch(browser, url) {
  const page = await browser.newPage();
  try {
    const menus = await (await fetch(`${url}/api/v1/plugin-menus`)).json();
    for (const [pluginId, searchKey, activeKey, optionLabel] of [
      ['sample1-offset-api', 'hostname', 'enabled', '환경'],
      ['sample2-single-api', 'fullName', 'active', '피드'],
    ]) {
      const menu = menus.find(item => item.pluginId === pluginId);
      assert.equal(menu.list.query.searchEnabled, true);
      const params = new URLSearchParams({ pluginId, sourceId: menu.sourceId, dataType: menu.dataType, page: '1', limit: '200' });
      const initial = await (await fetch(`${url}/api/v1/records?${params}`)).json();
      assert.ok(initial.items.length > 0, `${pluginId}의 기존 수집 데이터가 필요합니다.`);
      assert.ok(initial.pageInfo.totalItems <= 200, '이 fixture는 모든 행을 한 요청으로 비교합니다.');
      await page.goto(`${url}${menu.path}`);
      const search = page.getByRole('searchbox', { name: '검색', exact: true });
      await expect(search).toBeVisible();
      await expect(page.getByRole('button', { name: `${optionLabel} 필터`, exact: true })).toBeVisible();
      const first = initial.items[0].sourceValues;
      await search.fill(first[searchKey]);
      await search.press('Enter');
      const expected = initial.items.filter(item => item.sourceValues[searchKey].toLowerCase().includes(first[searchKey].toLowerCase())).length;
      await expect(page.getByText(`전체 ${expected.toLocaleString('ko-KR')}건`, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '검색어 지우기', exact: true }).click();
      await expect(search).toHaveValue('');
      await expect(page.getByText(`전체 ${initial.pageInfo.totalItems.toLocaleString('ko-KR')}건`, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '활성 상태 필터', exact: true }).click();
      await page.getByLabel('활성 상태', { exact: true }).selectOption(first[activeKey] ? '0' : '1');
      await page.getByRole('button', { name: `${optionLabel} 필터`, exact: true }).click();
      await page.getByLabel(optionLabel, { exact: true }).selectOption('0');
      const filtered = initial.items.filter(item => item.sourceValues[activeKey] === first[activeKey] && (pluginId === 'sample1-offset-api' ? item.sourceValues.environment === 'sandbox' : item.sourceValues.feed === 'true')).length;
      await expect(page.getByText(`전체 ${filtered.toLocaleString('ko-KR')}건`, { exact: true })).toBeVisible();
      console.log(`${menu.title}: 기존 ${initial.pageInfo.totalItems}건 검색·필터·개별 해제 통과`);
    }
  } finally { await page.close(); }
}
