import { testAssetSearch } from './test-asset-search-browser.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { chooseTheme } from './test-theme-browser.mjs';
import { root, port, start, stop, waitFor, healthy } from './web-test-helpers.mjs';
const dbRequire = createRequire(new URL('../packages/platform-db/package.json', import.meta.url));
const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { GenericContainer, Wait } = dbRequire('testcontainers');
const db = dbRequire('./dist/index.js');
const { conditionSql } = dbRequire('./dist/condition-sql.js');
const { NestFactory } = apiRequire('@nestjs/core');
const { AppModule } = apiRequire('./dist/app.module.js');
const { createPluginRuntimeRegistry } = apiRequire('./dist/plugin-runtime-registry.js');
const { validateRepository } = apiRequire('@oss-scp/plugin-config');
async function assertPopoverInViewport(locator, page) {
  await expect(locator).toBeVisible();
  const [box, viewport] = await Promise.all([locator.boundingBox(), page.evaluate(() => ({ width: globalThis.innerWidth, height: globalThis.innerHeight }))]);
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, '필터 팝오버가 viewport 안에 있어야 합니다.');
}
const reports = [];
for (const dialect of (process.env.SEARCH_DB_TYPE ? [process.env.SEARCH_DB_TYPE] : ['postgres', 'mysql'])) {
  assert.ok(['postgres', 'mysql'].includes(dialect));
  let container, connection, app, web, browser;
  try {
    const pg = dialect === 'postgres';
    container = await new GenericContainer(pg ? 'postgres:17.6-bookworm' : 'mysql:8.4.6')
      .withEnvironment(pg ? { POSTGRES_DB: 'oss_scp', POSTGRES_USER: 'oss_scp_app', POSTGRES_PASSWORD: 'test-password' } : { MYSQL_DATABASE: 'oss_scp', MYSQL_USER: 'oss_scp_app', MYSQL_PASSWORD: 'test-password', MYSQL_ROOT_PASSWORD: 'test-root-password' })
      .withExposedPorts(pg ? 5432 : 3306)
      .withWaitStrategy(Wait.forLogMessage(pg ? /database system is ready to accept connections/ : /ready for connections.*port: 3306/i, 2)).start();
    connection = await (pg ? db.postgresAdapter : db.mysqlAdapter).connect({ type: dialect, host: container.getHost(), port: container.getMappedPort(pg ? 5432 : 3306), database: 'oss_scp', user: 'oss_scp_app', password: 'test-password', poolMax: 3, connectTimeoutMs: 3000, tls: { mode: 'disable' } });
    await (pg ? db.runMigrations : db.runMysqlMigrations)(connection, db.discoverMigrations(db.defaultMigrationsDirectory(dialect)), 5000);
    const { storage, query } = db.createPlatformRecordAdapters(dialect, connection);
    const config = validateRepository(root); assert.equal(config.ok, true);
    // 실제 샘플 선언을 사용하고 multiSelect만 이 테스트 fixture에 추가한다.
    const definition = config.definitions.find(item => item.plugin.id === 'vulnerabilities-local-csv');
    definition.plugin.data.types.vulnerability.fields.name.filter = { kind: 'multiSelect', options: [{ value: 'Alpha', label: 'Alpha' }, { value: 'Beta', label: 'Beta' }] };
    const menu = config.menus.find(item => item.pluginId === definition.plugin.id);
    menu.list.query.filters.push({ key: 'name', label: '취약점명', type: 'string', ...definition.plugin.data.types.vulnerability.fields.name.filter });
    const scope = { pluginId: menu.pluginId, sourceId: menu.sourceId, scopeType: 'full', scopeKey: '', configRevision: 'search-test' };
    const runId = await storage.startRun({ ...scope, startedAt: '2026-09-14T00:00:00Z' });
    const records = Array.from({ length: 1000 }, (_, index) => ({ type: 'vulnerability', key: index, values: { cve: `CVE-${String(index).padStart(4, '0')}`, name: index < 45 ? 'Alpha' : 'Beta', score: index < 45 ? 9.5 : 3, affected: index < 45, observedAt: '2024-02-29T12:00:00+09:00' } }));
    await storage.commitBatch({ runId, scope, observedAt: '2026-09-14T01:00:00Z', expectedCheckpoint: null, nextCheckpoint: { offset: 1000 }, processedCount: 1000, acceptedCount: 1000, records, relations: [], issues: [] });
    for (const [pluginId, filename, recordsKey] of [['sample1-offset-api', 'sample1.json', 'rows'], ['sample2-single-api', 'sample2.json', 'items']]) {
      const assetMenu = config.menus.find(item => item.pluginId === pluginId);
      const plugin = config.definitions.find(item => item.plugin.id === pluginId).plugin;
      const fixture = JSON.parse(await readFile(`${root}/fixtures/sources/${filename}`, 'utf8'));
      const transform = apiRequire(plugin.transformPath).transform;
      const assetScope = { ...scope, pluginId, sourceId: assetMenu.sourceId };
      const assetRun = await storage.startRun({ ...assetScope, startedAt: '2026-09-14T00:00:00Z' });
      const assetRecords = fixture[recordsKey].flatMap(record => transform({ record, context: { responseMetadata: { test_field6: fixture.test_field6 } } }).records).map(record => ({ ...record, key: record.values[plugin.data.types[record.type].uniqueKey] }));
      await storage.commitBatch({ runId: assetRun, scope: assetScope, observedAt: '2026-09-14T01:00:00Z', expectedCheckpoint: null, nextCheckpoint: { offset: assetRecords.length }, processedCount: assetRecords.length, acceptedCount: assetRecords.length, records: assetRecords, relations: [], issues: [] });
    }
    app = await NestFactory.create(AppModule.register(connection, query, createPluginRuntimeRegistry(config)), { logger: false });
    await app.listen(0, '127.0.0.1');
    const apiUrl = await app.getUrl();
    const webPort = await port(); const url = `http://127.0.0.1:${webPort}`;
    web = start('pnpm', ['--filter', '@oss-scp/web', 'dev', '--port', String(webPort)], { env: { ...process.env, API_PROXY_TARGET: apiUrl } });
    await waitFor(() => healthy(url), '검색 테스트 웹');
    browser = await chromium.launch();
    await testAssetSearch(browser, url);
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(`${url}${menu.path}`);
    await expect(mobile.getByText('전체 1,000건', { exact: true })).toBeVisible();
    await mobile.locator('.record-table-wrap').evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await mobile.getByRole('button', { name: '관측 시각 필터' }).click();
    await assertPopoverInViewport(mobile.getByRole('dialog', { name: '관측 시각 필터' }), mobile);
    await mobile.keyboard.press('Escape');
    await expect(mobile.getByRole('dialog', { name: '관측 시각 필터' })).toHaveCount(0);
    await mobile.close();
    const page = await browser.newPage();
    const requests = [];
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/v1/records') requests.push(new URL(request.url())); });
    await page.goto(`${url}${menu.path}`);
    await expect(page.getByText('전체 1,000건', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
    await expect(page.getByRole('button', { name: '2페이지', exact: true })).toHaveAttribute('aria-current', 'page');
    const search = page.getByRole('searchbox', { name: '검색', exact: true });
    await chooseTheme(page, 'light');
    const lightBackground = await search.evaluate(element => globalThis.getComputedStyle(element).backgroundColor);
    await chooseTheme(page, 'dark');
    const darkColors = await search.evaluate(element => ({ background: globalThis.getComputedStyle(element).backgroundColor, text: globalThis.getComputedStyle(element).color }));
    assert.notEqual(darkColors.background, lightBackground);
    assert.notEqual(darkColors.text, darkColors.background);
    await chooseTheme(page, 'light');
    const beforeEdit = requests.length;
    await search.fill('Alpha');
    await expect(page.getByText('변경한 조건이 아직 적용되지 않았습니다.')).toBeVisible();
    assert.equal(requests.length, beforeEdit);
    await search.press('Enter');
    await expect(page.getByText('전체 45건', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '1페이지', exact: true })).toHaveAttribute('aria-current', 'page');
    assert.equal(requests.at(-1).searchParams.get('page'), '1');
    await page.getByRole('button', { name: '마지막 페이지', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(5);
    await page.getByRole('button', { name: '영향 여부 필터' }).click();
    await page.getByLabel('영향 여부', { exact: true }).selectOption('0');
    await page.getByRole('button', { name: '점수 필터' }).click();
    await assertPopoverInViewport(page.getByRole('dialog', { name: '점수 필터' }), page);
    await page.getByLabel('점수 최솟값').fill('9');
    await page.getByLabel('점수 최댓값').fill('10');
    await page.getByRole('button', { name: '관측 시각 필터' }).click();
    await page.getByLabel('관측 시각 시작일 (UTC)').fill('2024-02-29');
    await page.getByLabel('관측 시각 종료일 (UTC)').fill('2024-02-29');
    await page.getByRole('button', { name: '취약점명 필터' }).click();
    await page.getByLabel('취약점명', { exact: true }).selectOption(['0', '1']);
    await page.getByRole('button', { name: '적용', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(20);
    const applied = JSON.parse(requests.at(-1).searchParams.get('filters'));
    assert.equal(applied.find(filter => filter.field === 'affected').value, true);
    assert.deepEqual(applied.find(filter => filter.field === 'name').values, ['Alpha', 'Beta']);
    await page.getByRole('button', { name: '점수 필터' }).click();
    await page.getByLabel('점수 최솟값').fill('11');
    const beforeInvalid = requests.length;
    await page.getByRole('button', { name: '적용', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('범위를 확인'); assert.equal(requests.length, beforeInvalid);
    await page.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(search).toHaveValue(''); await expect(page.getByText('전체 1,000건', { exact: true })).toBeVisible();
    await search.fill('missing'); await search.press('Enter');
    await expect(page.getByText('검색·필터 결과가 없습니다.', { exact: false })).toBeVisible();
    await expect(page.getByText('현재 수집이 진행 중입니다.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: '조건 초기화', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(page.getByText('전체 1,000건', { exact: true })).toBeVisible();
    // 첫 요청 실패 뒤 같은 적용 조건을 재시도한다.
    await page.route('**/api/v1/records?**', route => route.fulfill({ status: 503, json: { code: 'QUERY_FAILED' } }), { times: 1 });
    await search.fill('Alpha'); await search.press('Enter');
    await expect(page.getByRole('alert')).toBeVisible();
    const failedQuery = requests.at(-1).search;
    await page.getByRole('button', { name: '다시 시도', exact: true }).click();
    await expect(page.getByText('전체 45건', { exact: true })).toBeVisible(); assert.equal(requests.at(-1).search, failedQuery);
    // 오래된 응답을 보류한 동안 새 조건을 적용해 행 제거와 응답 무시를 검증한다.
    let release; let intercepted; let completed;
    const finished = new Promise(resolve => { completed = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { intercepted = resolve; });
    await page.route('**/api/v1/records?**', async route => {
      const response = await route.fetch(); intercepted(); await held;
      try { await route.fulfill({ response }); } catch { /* 취소된 이전 요청 */ } finally { completed(); }
    }, { times: 1 });
    await search.fill('Beta'); await search.press('Enter'); await started;
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await search.fill('Alpha'); await search.press('Enter');
    await expect(page.getByText('전체 45건', { exact: true })).toBeVisible(); release(); await finished;
    await page.evaluate(() => new Promise(resolve => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))));
    await expect(page.locator('tbody tr')).toHaveCount(20);
    // 메뉴가 바뀌면 draft와 적용 조건을 모두 초기화한다.
    await page.getByRole('link', { name: '저장소', exact: true }).click();
    await expect(page.getByRole('searchbox')).toHaveValue('');
    await expect(page.getByRole('button', { name: '활성 상태 필터', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '취약점', exact: true }).click();
    await expect(search).toHaveValue(''); await expect(page.getByText('전체 1,000건', { exact: true })).toBeVisible();
    await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
    await page.screenshot({ path: `${root}/test-results/record-search-${dialect}.png`, fullPage: true });
    const conditions = db.normalizeRecordConditions('Alpha', [{ field: 'score', kind: 'numberRange', min: 9 }], { searchFields: ['cve', 'name'], filters: menu.list.query.filters });
    const input = { pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'vulnerability', conditions, limit: 20 };
    const measured = performance.now(); await query.listRecords(input); const elapsedMs = performance.now() - measured;
    const filtered = conditionSql(conditions, dialect, pg ? 3 : 0);
    const sql = pg ? `EXPLAIN (FORMAT JSON) SELECT id FROM platform_records WHERE plugin_id=$1 AND source_id=$2 AND data_type=$3${filtered.sql} ORDER BY last_seen_at DESC, id ASC LIMIT 21` : `EXPLAIN FORMAT=JSON SELECT id FROM platform_records WHERE query_scope_hash=?${filtered.sql} ORDER BY last_seen_at DESC, id ASC LIMIT 21`;
    const parameters = pg ? [scope.pluginId, scope.sourceId, 'vulnerability', ...filtered.parameters] : [db.recordQueryScopeIdentity(scope.pluginId, scope.sourceId, 'vulnerability'), ...filtered.parameters];
    const explain = await connection.withClient(client => client.query(sql, parameters));
    reports.push({ dialect, rows: 1000, matches: 45, elapsedMs: Number(elapsedMs.toFixed(2)), explain: pg ? explain.rows : explain[0] });
    console.log(`${dialect}: 검색·필터 표→API→DB, 입력·초기화·재시도·경합 검증 통과 (${elapsedMs.toFixed(2)} ms)`);
  } finally { await browser?.close(); await stop(web); if (app) await app.close(); else await connection?.close(); await container?.stop(); }
}
await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
await writeFile(new URL(`../test-results/record-search-${process.env.SEARCH_DB_TYPE ?? 'both'}.json`, import.meta.url), JSON.stringify(reports, null, 2));
