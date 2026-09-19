import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { preflightConfiguration } from '../packages/plugin-config/dist/index.js';
import { processRecords } from '../packages/collection-engine/dist/index.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceSkill = join(repositoryRoot, 'skills/oss-scp-plugin-init');
const supportedSources = ['json-single', 'json-offset', 'csv-file', 'csv-http'];
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const runNode = (script, args) => spawnSync(process.execPath, [script, ...args], {
  encoding: 'utf8',
  shell: false,
});

function workspace(t) {
  const temporary = mkdtempSync(join(tmpdir(), 'oss-scp-plugin-init-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const installedSkill = join(temporary, 'installed-skill');
  cpSync(sourceSkill, installedSkill, { recursive: true });
  return {
    temporary,
    installedSkill,
    root: join(temporary, 'config with spaces'),
  };
}

function create(installedSkill, root, source = 'csv-file', id = 'company-assets') {
  return runNode(join(installedSkill, 'scripts/init.mjs'), [
    '--root', root,
    '--id', id,
    '--source', source,
  ]);
}

for (const source of supportedSources) {
  test(`${source}: 복사된 스킬만으로 생성하고 실제 플랫폼 계약과 transform 실행을 확인한다`, async (t) => {
    const { installedSkill, root } = workspace(t);
    const created = create(installedSkill, root, source);
    assert.equal(created.status, 0, created.stderr);

    const plugin = readJson(join(root, 'plugins/company-assets/plugin.json'));
    const sourceConfig = readJson(join(root, 'plugins/company-assets/source.json'));
    const pluginRegistry = readJson(join(root, 'plugins/registry.json'));
    const connectionRegistry = readJson(join(root, 'connections/registry.json'));
    assert.deepEqual(pluginRegistry, { plugins: ['./company-assets'] });
    assert.equal(plugin.id, 'company-assets');
    assert.equal(plugin.data.types.item.uniqueKey, 'id');
    assert.deepEqual(plugin.data.types.item.views.list.columns, ['id', 'name']);
    assert.deepEqual(plugin.data.types.item.views.detail.sections[0].fields, ['id', 'name']);
    assert.equal(existsSync(join(root, 'plugins/company-assets/transform.js')), true);
    assert.equal(existsSync(join(root, 'fixtures/items.json')), true);
    assert.equal(existsSync(join(root, 'fixtures/items.csv')), true);

    if (source === 'csv-file') {
      assert.equal(sourceConfig.transport, 'file');
      assert.deepEqual(connectionRegistry.connections, []);
    } else {
      assert.deepEqual(connectionRegistry.connections, ['./company-assets-source.json']);
      const connection = readJson(join(root, 'connections/company-assets-source.json'));
      assert.equal(connection.id, 'company-assets-source');
      assert.equal(connection.connector, 'http');
    }
    if (source.startsWith('json-')) assert.equal(sourceConfig.pagination.type, source.slice(5));
    if (source === 'csv-http') assert.equal(sourceConfig.transport, 'http');

    const configuration = await preflightConfiguration(root);
    assert.equal(configuration.ok, true, JSON.stringify(configuration.errors));
    assert.equal(configuration.definitions.length, 1);
    assert.equal(configuration.menus[0].path, '/company-assets');

    const input = readJson(join(root, 'fixtures/items.json')).items;
    const batches = [];
    const result = await processRecords({
      plugin: configuration.definitions[0].plugin,
      records: input,
      sourceId: 'example',
      collectedAt: '2026-09-19T00:00:00Z',
      consume: async (batch) => batches.push(batch),
    });
    assert.equal(result.status, 'success');
    assert.equal(result.accepted, 1);
    assert.deepEqual(batches[0].records, [{
      type: 'item',
      values: { id: 'item-1', name: '예제 항목' },
    }]);

    const validated = runNode(join(installedSkill, 'scripts/validate.mjs'), [
      '--root', root,
      '--platform-root', repositoryRoot,
    ]);
    assert.equal(validated.status, 0, validated.stderr);
    assert.match(validated.stdout, /실제 원천 호출·수집·저장·조회는 별도로 확인/);
  });
}

test('잘못된 ID·source·인자와 누락된 부모는 출력 생성 전에 실패한다', (t) => {
  const { temporary, installedSkill, root } = workspace(t);
  const cases = [
    ['--root', root, '--id', '../escape', '--source', 'csv-file'],
    ['--root', root, '--id', 'UPPER', '--source', 'csv-file'],
    ['--root', root, '--id', `a${'b'.repeat(100)}`, '--source', 'csv-file'],
    ['--root', root, '--id', 'valid', '--source', 'graphql'],
    ['--root', root, '--id', 'valid', '--source', '__proto__'],
    ['--root', root, '--id', 'valid', '--unknown', 'value'],
    ['--root', root],
    ['--root', join(temporary, 'missing-parent/output'), '--id', 'valid', '--source', 'csv-file'],
  ];
  for (const args of cases) {
    const result = runNode(join(installedSkill, 'scripts/init.mjs'), args);
    assert.notEqual(result.status, 0, `성공하면 안 되는 인자: ${args.join(' ')}`);
  }
  assert.equal(existsSync(root), false);
  assert.equal(existsSync(join(temporary, 'escape')), false);
});

test('기존 파일·폴더·symlink를 따르거나 덮어쓰지 않는다', (t) => {
  const { temporary, installedSkill } = workspace(t);
  const sentinel = join(temporary, 'sentinel.txt');
  writeFileSync(sentinel, '사용자 데이터');

  const fileTarget = join(temporary, 'existing-file');
  writeFileSync(fileTarget, '기존 파일');
  assert.notEqual(create(installedSkill, fileTarget).status, 0);
  assert.equal(readFileSync(fileTarget, 'utf8'), '기존 파일');

  const directoryTarget = join(temporary, 'existing-directory');
  mkdirSync(directoryTarget);
  writeFileSync(join(directoryTarget, 'data.txt'), '기존 폴더 데이터');
  assert.notEqual(create(installedSkill, directoryTarget).status, 0);
  assert.equal(readFileSync(join(directoryTarget, 'data.txt'), 'utf8'), '기존 폴더 데이터');

  const linkTarget = join(temporary, 'existing-link');
  symlinkSync(directoryTarget, linkTarget);
  assert.notEqual(create(installedSkill, linkTarget).status, 0);
  assert.equal(readFileSync(join(linkTarget, 'data.txt'), 'utf8'), '기존 폴더 데이터');
  assert.equal(readFileSync(sentinel, 'utf8'), '사용자 데이터');
});

test('생성 중 실패하면 임시 sibling만 정리하고 출력 밖 데이터를 보존한다', (t) => {
  const { temporary, installedSkill, root } = workspace(t);
  const sentinel = join(temporary, 'sentinel.txt');
  writeFileSync(sentinel, '보존');
  const brokenAsset = join(installedSkill, 'assets/transform.js');
  rmSync(brokenAsset);
  mkdirSync(brokenAsset);

  const result = create(installedSkill, root);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(root), false);
  assert.equal(readFileSync(sentinel, 'utf8'), '보존');
  assert.equal(readdirSync(temporary).some((name) => name.startsWith('.config with spaces.tmp-')), false);
});

test('잘못된 필드 참조와 transform export를 실제 로컬 검증기가 거부한다', (t) => {
  const { installedSkill, root } = workspace(t);
  assert.equal(create(installedSkill, root).status, 0);
  const validateArgs = ['--root', root, '--platform-root', repositoryRoot];
  const pluginPath = join(root, 'plugins/company-assets/plugin.json');
  const plugin = readJson(pluginPath);
  plugin.data.types.item.views.list.columns = ['missing'];
  writeFileSync(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`);
  const invalidField = runNode(join(installedSkill, 'scripts/validate.mjs'), validateArgs);
  assert.notEqual(invalidField.status, 0);
  assert.match(invalidField.stderr, /columns/);

  plugin.data.types.item.views.list.columns = ['id'];
  writeFileSync(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`);
  writeFileSync(join(root, 'plugins/company-assets/transform.js'), 'export const wrong = 1;\n');
  const invalidExport = runNode(join(installedSkill, 'scripts/validate.mjs'), validateArgs);
  assert.notEqual(invalidExport.status, 0);
  assert.match(invalidExport.stderr, /transform/);
});

test('검증 환경 누락·중복, 미빌드 checkout과 고정되지 않은 이미지를 거부한다', async (t) => {
  const { temporary, installedSkill, root } = workspace(t);
  assert.equal(create(installedSkill, root).status, 0);
  const { validationCommand } = await import(`../skills/oss-scp-plugin-init/scripts/validate.mjs?test=${Date.now()}`);
  const invalid = [
    { root },
    { root, image: 'oss-scp-api:1.2.3', 'platform-root': repositoryRoot },
    { root, 'platform-root': temporary },
    { root, image: 'oss-scp-api:latest' },
    { root, image: 'oss-scp-api' },
    { root, image: '-malicious:1.2.3' },
    { root, image: 'oss-scp-api:branch' },
  ];
  for (const options of invalid) assert.throws(() => validationCommand(options));
});

test('Docker 검증 명령은 로컬 이미지를 먼저 확인하고 격리 옵션과 읽기 전용 mount를 사용한다', async (t) => {
  const { root, installedSkill } = workspace(t);
  assert.equal(create(installedSkill, root).status, 0);
  const { runValidation, validationCommand } = await import(`../skills/oss-scp-plugin-init/scripts/validate.mjs?docker=${Date.now()}`);
  const image = 'registry.example:5000/oss-scp/api:v1.2.3-rc.1';
  const plan = validationCommand({ root, image });
  assert.equal(plan.command, 'docker');
  assert.deepEqual(plan.args.slice(0, 6), [
    'run', '--rm', '--pull=never', '--network=none', '--read-only', '--mount',
  ]);
  assert.match(plan.args[6], /^type=bind,src=.*config with spaces,dst=\/config,readonly$/);
  assert.deepEqual(plan.args.slice(-4), [
    image,
    '/app/node_modules/@oss-scp/plugin-config/dist/cli.js',
    '--root',
    '/config',
  ]);
  assert.equal(
    validationCommand({ root, image: `oss-scp-api@sha256:${'a'.repeat(64)}` }).mode,
    'docker',
  );

  const missingCalls = [];
  assert.throws(() => runValidation({ root, image }, (command, args, options) => {
    missingCalls.push({ command, args, options });
    return { status: 1 };
  }), /로컬에 준비된 이미지를 찾을 수 없습니다/);
  assert.equal(missingCalls.length, 1);
  assert.deepEqual(missingCalls[0].args, ['image', 'inspect', image]);
  assert.equal(missingCalls[0].options.shell, false);

  const calls = [];
  const status = runValidation({ root, image }, (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0 };
  });
  assert.equal(status, 0);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.shell, false);
  assert.equal(calls[1].args.includes('--pull=never'), true);
  assert.equal(calls[1].args.includes('--network=none'), true);
  assert.equal(calls[1].args.includes('--read-only'), true);
});

test('문서 링크와 package·workflow 실행 계약을 유지한다', () => {
  const read = (path) => readFileSync(join(repositoryRoot, path), 'utf8');
  assert.match(read('README.md'), /\(docs\/plugin-init-skill\.md\)/);
  assert.equal(existsSync(join(repositoryRoot, 'docs/plugin-init-skill.md')), true);
  assert.match(read('docs/plugin-development.md'), /\(plugin-init-skill\.md\)/);
  assert.match(read('skills/oss-scp-plugin-init/SKILL.md'), /\(references\/authoring\.md/);

  const packageJson = JSON.parse(read('package.json'));
  assert.match(packageJson.scripts['test:plugin-init'], /test-plugin-init\.mjs/);
  assert.match(packageJson.scripts['test:plugin-init:docker'], /test-plugin-init-docker\.mjs/);
  const workflow = read('.github/workflows/integration-ci.yaml');
  assert.match(workflow, /pnpm test:plugin-init\n/);
  assert.match(workflow, /pnpm test:plugin-init:docker -- oss-scp-api:0\.0\.0-plugin-init/);
});
