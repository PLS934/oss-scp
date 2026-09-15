import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validationCommand } from '../skills/oss-scp-plugin-init/scripts/validate.mjs';
import { preflightConfiguration } from '../packages/plugin-config/dist/index.js';
import { processRecords } from '../packages/collection-engine/dist/index.js';

const repo = fileURLToPath(new URL('../', import.meta.url));
const skill = join(repo, 'skills/oss-scp-plugin-init');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
function workspace(t) {
  const temp = mkdtempSync(join(tmpdir(), 'oss-scp-plugin-init-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const installed = join(temp, 'installed-skill');
  cpSync(skill, installed, { recursive: true });
  return { temp, installed, root: join(temp, 'config with spaces') };
}
function create(installed, root, source = 'csv-file') {
  return run(join(installed, 'scripts/init.mjs'), ['--root', root, '--id', 'company-assets', '--source', source]);
}

for (const source of ['json-single', 'json-offset', 'csv-file', 'csv-http']) {
  test(`${source}: 복사된 스킬만으로 생성하고 실제 플랫폼 계약으로 검증`, async (t) => {
    const { installed, root } = workspace(t);
    const created = create(installed, root, source);
    assert.equal(created.status, 0, created.stderr);
    const config = await preflightConfiguration(root);
    assert.equal(config.ok, true, JSON.stringify(config.errors));
    assert.equal(config.definitions.length, 1);
    assert.equal(config.menus[0].path, '/company-assets');
    assert.equal(json(join(root, 'connections/registry.json')).connections.length, source === 'csv-file' ? 0 : 1);
    const records = json(join(root, 'fixtures/items.json')).items;
    const batches = [];
    const result = await processRecords({
      plugin: config.definitions[0].plugin, records, sourceId: 'example',
      collectedAt: '2026-09-15T00:00:00Z', consume: async (batch) => { batches.push(batch); },
    });
    assert.equal(result.status, 'success');
    assert.equal(result.accepted, 1);
    assert.deepEqual(batches[0].records, [{ type: 'item', values: records[0] }]);
    const cli = run(join(installed, 'scripts/validate.mjs'), ['--root', root, '--platform-root', repo]);
    assert.equal(cli.status, 0, cli.stderr);
  });
}

test('기존 폴더와 심볼릭 링크를 덮어쓰지 않는다', (t) => {
  const { installed, root, temp } = workspace(t);
  assert.equal(create(installed, root).status, 0);
  const sentinel = join(root, 'README.md');
  writeFileSync(sentinel, '사용자 데이터');
  assert.notEqual(create(installed, root).status, 0);
  assert.equal(readFileSync(sentinel, 'utf8'), '사용자 데이터');
  const link = join(temp, 'link');
  symlinkSync(root, link);
  assert.notEqual(create(installed, link).status, 0);
  assert.equal(readFileSync(sentinel, 'utf8'), '사용자 데이터');
});

test('잘못된 ID·source·인자는 출력 생성 전에 실패한다', (t) => {
  const { installed, root } = workspace(t);
  for (const args of [
    ['--root', root, '--id', '../escape', '--source', 'csv-file'],
    ['--root', root, '--id', 'valid', '--source', 'graphql'],
    ['--root', root, '--id', 'valid', '--source', '__proto__'],
    ['--root', root, '--id', 'valid', '--unknown', 'value'],
    ['--root', root],
  ]) {
    assert.notEqual(run(join(installed, 'scripts/init.mjs'), args).status, 0);
    assert.equal(existsSync(root), false);
  }
});

test('필드 참조와 transform export 오류를 실제 검증 CLI가 거부한다', (t) => {
  const { installed, root } = workspace(t);
  assert.equal(create(installed, root).status, 0);
  const path = join(root, 'plugins/company-assets/plugin.json');
  const plugin = json(path);
  plugin.data.types.item.views.list.columns = ['missing'];
  writeFileSync(path, JSON.stringify(plugin));
  const args = ['--root', root, '--platform-root', repo];
  const invalid = run(join(installed, 'scripts/validate.mjs'), args);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /columns/);
  plugin.data.types.item.views.list.columns = ['id'];
  writeFileSync(path, JSON.stringify(plugin));
  writeFileSync(join(root, 'plugins/company-assets/transform.js'), 'export const wrong = 1;\n');
  assert.notEqual(run(join(installed, 'scripts/validate.mjs'), args).status, 0);
});

test('누락·빈 유일키는 공통 엔진에서 실패하고 중복 키는 격리된다', async (t) => {
  const { installed, root } = workspace(t);
  assert.equal(create(installed, root).status, 0);
  const config = await preflightConfiguration(root);
  const result = await processRecords({
    plugin: config.definitions[0].plugin,
    records: [{ id: 'a', name: '정상' }, { id: 'a', name: '중복' }, { name: '누락' }, { id: ' ', name: '빈 키' }],
    sourceId: 'example', collectedAt: '2026-09-15T00:00:00Z', consume: async () => {},
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.accepted, 1);
  assert.equal(result.rejected, 3);
});

test('검증 환경 누락과 잘못된 이미지 참조는 실패한다', (t) => {
  const { installed, root, temp } = workspace(t);
  assert.equal(create(installed, root).status, 0);
  for (const options of [
    { root }, { root, image: 'oss-scp-api:latest' }, { root, image: 'localhost:5000/oss-scp-api' },
    { root, image: 'oss-scp-api:0.1.0', 'platform-root': repo }, { root, 'platform-root': temp },
  ]) assert.throws(() => validationCommand(options));
  const cli = run(join(installed, 'scripts/validate.mjs'), ['--root', root, '--platform-root', temp]);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /build/);
});

test('Docker 호출은 고정 이미지·네트워크 차단·읽기 전용 mount를 사용한다', (t) => {
  const { root, installed } = workspace(t);
  assert.equal(create(installed, root).status, 0);
  const image = 'oss-scp-api:0.1.0';
  const plan = validationCommand({ root, image });
  assert.equal(plan.command, 'docker');
  for (const flag of ['--pull=never', '--network=none', '--read-only']) assert.ok(plan.args.includes(flag));
  assert.match(plan.args[plan.args.indexOf('--mount') + 1], /config with spaces,dst=\/config,readonly$/);
  assert.deepEqual(plan.args.slice(-4), [image, '/app/node_modules/@oss-scp/plugin-config/dist/cli.js', '--root', '/config']);
  assert.equal(validationCommand({ root, image: `oss-scp-api@sha256:${'a'.repeat(64)}` }).command, 'docker');
});
