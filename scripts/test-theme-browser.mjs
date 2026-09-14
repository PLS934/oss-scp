/* global getComputedStyle, localStorage, Storage */
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function chooseTheme(page, theme) {
  const button = page.getByRole('button', { name: /모드로 전환$/ });
  if (await button.locator('[data-theme-icon]').getAttribute('data-theme-icon') !== theme) await button.click();
}

export async function testTheme(browser, url) {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.getByRole('banner').getByRole('status')).toBeVisible();
  await expect(page.getByRole('banner').locator('.version')).toBeVisible();
  await expect(page.locator('aside').getByRole('status')).toHaveCount(0);
  const picker = page.getByRole('button', { name: /모드로 전환$/ });
  await expect(picker).toHaveAttribute('aria-label', '라이트 모드로 전환');
  await expect(page.getByRole('banner').locator('[data-theme-icon]')).toHaveAttribute('data-theme-icon', 'dark');
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'light');
  await picker.focus();
  await expect(picker).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(picker).toHaveAttribute('aria-label', '라이트 모드로 전환');
  await expect(page.getByRole('banner').locator('[data-theme-icon]')).toHaveAttribute('data-theme-icon', 'dark');
  await page.keyboard.press('Space');
  await expect(page.getByRole('banner').locator('[data-theme-icon]')).toHaveAttribute('data-theme-icon', 'light');
  await picker.click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(picker).toHaveAttribute('aria-label', '라이트 모드로 전환');
  await page.close();
  const revisit = await context.newPage();
  await revisit.goto(url);
  await expect(revisit.getByRole('button', { name: '라이트 모드로 전환' })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await chooseTheme(revisit, theme);
    await expect(revisit.getByRole('banner').locator('[data-theme-icon]')).toHaveAttribute('data-theme-icon', theme);
    await revisit.evaluate(() => {
      const section = document.querySelector('main section');
      section.insertAdjacentHTML('beforeend', '<p class="empty-state">빈 목록</p><p class="list-message">안내</p><p class="list-message error">오류</p><p class="invalid-value">잘못된 값</p><p class="empty-value">빈 값</p><button>확인</button>');
    });
    const pairs = await revisit.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const value = name => css.getPropertyValue(`--${name}`).trim();
      return [['text', 'background'], ['text', 'surface'], ['muted', 'surface'], ['text', 'info'], ['error-text', 'error-background'], ['error-text', 'surface'], ['sidebar-text', 'sidebar'], ['sidebar-muted', 'sidebar'], ['sidebar-text', 'sidebar-active'], ['success', 'surface'], ['failure', 'surface'], ['control-border', 'surface'], ['focus', 'surface'], ['focus', 'background'], ['sidebar-focus', 'sidebar']].map(([a, b]) => [a, value(a), value(b)]);
    });
    const luminance = hex => {
      if (/^#[a-f\d]{3}$/i.test(hex)) hex = '#' + [...hex.slice(1)].map(value => value + value).join('');
      const channels = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    for (const [name, a, b] of pairs) {
      const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
      assert.ok((values[0] + .05) / (values[1] + .05) >= (['focus', 'sidebar-focus', 'control-border'].includes(name) ? 3 : 4.5), `${theme}: ${name} contrast`);
    }
    await revisit.setViewportSize({ width: 390, height: 844 });
    await expect(revisit.getByRole('button', { name: /모드로 전환$/ })).toBeVisible();
    await revisit.screenshot({ path: `/tmp/oss-scp-theme-${theme}.png`, fullPage: true });
  }
  await context.close();
  for (const theme of ['light', 'dark']) {
    const initial = await browser.newContext({ colorScheme: theme === 'dark' ? 'light' : 'dark' });
    await initial.addInitScript(value => localStorage.setItem('oss-scp.theme', value), theme);
    const first = await initial.newPage();
    // Hold the application module: head initialization must already have applied the saved theme.
    await first.route(/\/(src\/main\.tsx|assets\/index-[^/]+\.js)/, route => route.abort());
    await first.goto(url);
    await expect(first.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await first.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(theme === 'dark' ? 'rgb(16, 24, 32)' : 'rgb(244, 246, 248)');
    await initial.close();
  }
  const blocked = await browser.newContext();
  await blocked.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'getItem', { value() { throw Error('blocked'); } });
    Object.defineProperty(Storage.prototype, 'setItem', { value() { throw Error('blocked'); } });
  });
  const failure = await blocked.newPage();
  await failure.goto(url);
  await chooseTheme(failure, 'dark');
  await expect(failure.locator('html')).toHaveAttribute('data-theme', 'dark');
  await blocked.close();
}
