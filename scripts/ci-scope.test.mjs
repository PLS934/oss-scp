import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { classifyFiles, detectScope } from './ci-scope.mjs';

const all = { code: true, bundle: true, mock: true };
const none = { code: false, bundle: false, mock: false };
const code = { code: true, bundle: false, mock: false };
const bundle = { code: true, bundle: true, mock: false };
const mock = { code: true, bundle: false, mock: true };
const flags = ({ code, bundle, mock }) => ({ code, bundle, mock });

for (const [name, files, expected] of [
  ['문서·OpenSpec 전용', ['README.md', 'docs/development-workflow.md', 'openspec/config.yaml', 'openspec/changes/example/specs/ci/spec.md', '.github/ISSUE_TEMPLATE/bug_report.md'], none],
  ['웹 테스트 전용', ['apps/web/test/record-list.test.tsx', 'README.md'], code],
  ['DB 테스트와 fixture', ['packages/platform-db/test/postgres.test.mjs', 'packages/platform-db/test/record-contract.mjs'], code],
  ['테스트 설정', ['apps/api/vitest.config.mjs'], code],
  ['mock 구현', ['apps/mock-api/src/app.ts'], mock],
  ['배포 스크립트', ['release/bundle/install.sh', 'scripts/build-offline-bundles.sh'], bundle],
  ['번들에 들어가는 README', ['release/bundle/README.md'], bundle],
  ['릴리스 테스트', ['scripts/test-release-docker.sh', 'scripts/test-offline-bundle-docker.sh', 'scripts/test-release-workflow.mjs'], bundle],
  ['manifest와 검증 코드', ['scripts/bundle-manifest.mjs', 'scripts/verify-release-image.mjs'], bundle],
  ['mock와 번들 혼합', ['apps/mock-api/src/app.ts', 'release/bundle/install.sh'], all],
  ['웹 런타임', ['apps/web/src/record-list.tsx'], all],
  ['서버 런타임', ['apps/api/src/main.ts'], all],
  ['migration', ['packages/platform-db/migrations/postgres/0005-new.sql'], all],
  ['공통 의존성', ['packages/plugin-config/src/index.ts'], all],
  ['플러그인과 설정', ['plugins/sample1-offset-api/transform.ts', 'connections/registry.json'], all],
  ['lockfile', ['pnpm-lock.yaml'], all],
  ['workspace 구성', ['pnpm-workspace.yaml'], all],
  ['루트 실행 명령', ['package.json'], all],
  ['CI 자체', ['.github/workflows/integration-ci.yaml'], all],
  ['변경 분류기', ['scripts/ci-scope.mjs'], all],
  ['Compose', ['compose.dev.yaml'], all],
  ['Dockerfile', ['apps/api/Dockerfile'], all],
  ['Docker context', ['.dockerignore'], all],
  ['공통 테스트 helper', ['scripts/web-test-helpers.mjs'], all],
  ['모르는 앱', ['apps/new-app/test/example.test.mjs'], all],
  ['문서 폴더의 실행 파일', ['docs/setup.sh'], all],
  ['미분류 파일', ['new-runtime-config.json'], all],
  ['빈 diff', [], all],
  ['대량 변경 중 마지막 런타임 파일', [...Array.from({ length: 400 }, (_, i) => `docs/${i}.md`), 'apps/api/src/main.ts'], all],
]) {
  test(name, () => assert.deepEqual(classifyFiles(files), expected));
}

const before = 'a'.repeat(40);
const after = 'b'.repeat(40);
const push = { before, after, ref: 'refs/heads/main' };
const pull = { pull_request: { base: { sha: before }, head: { sha: after } } };

test('PR 전체 차이는 merge-base, push는 before..after로 비교한다', () => {
  for (const [eventName, event, range] of [['pull_request', pull, `${before}...${after}`], ['push', push, `${before}..${after}`]]) {
    const result = detectScope({ eventName, event, git(args) {
      assert.deepEqual(args, ['diff', '--name-only', '--no-renames', '-z', range, '--']);
      return 'docs/space and\nnewline.md\0';
    } });
    // 파일명에 개행이 있어도 경계가 보존되어 미분류 파일은 전체 검증한다.
    assert.deepEqual(flags(result), all);
  }
});

test('수동·태그·재사용 전체 검증은 diff에 의존하지 않는다', () => {
  for (const params of [
    { eventName: 'workflow_dispatch', event: {} },
    { eventName: 'workflow_call', event: {} },
    { eventName: 'push', event: { ...push, ref: 'refs/tags/v0.1.0' } },
    { eventName: 'pull_request', event: pull, forceFull: true },
    { eventName: 'push', event: push, forceFull: true },
  ]) {
    assert.deepEqual(flags(detectScope({ ...params, git() { assert.fail('전체 검증에서 diff 호출'); } })), all);
  }
});

test('commit 누락·잘못된 SHA·최초 push·diff 실패는 전체 검증한다', () => {
  for (const event of [{}, { ...push, before: '0'.repeat(40) }, { ...push, before: '--invalid' }]) {
    assert.deepEqual(flags(detectScope({ eventName: 'push', event, git() { assert.fail('잘못된 SHA로 git 호출'); } })), all);
  }
  assert.deepEqual(flags(detectScope({ eventName: 'push', event: push, git() { throw new Error('missing commit'); } })), all);
});

test('실제 git diff에서 PR 누적 변경·push 변경·삭제·rename의 이전 경로를 보존한다', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'oss-scp-ci-scope-'));
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const commit = () => { git(['add', '.']); git(['commit', '-qm', 'fixture']); return git(['rev-parse', 'HEAD']).trim(); };
  const detect = (base, head, eventName = 'push') => detectScope({ eventName, git, event: eventName === 'push' ? { before: base, after: head } : { pull_request: { base: { sha: base }, head: { sha: head } } } });
  try {
    git(['init', '-q']);
    git(['config', 'user.email', 'ci@example.invalid']);
    git(['config', 'user.name', 'CI test']);
    mkdirSync(join(cwd, 'docs'));
    writeFileSync(join(cwd, 'docs/guide.md'), 'guide');
    const base = commit();
    writeFileSync(join(cwd, 'runtime.json'), '{}');
    const runtime = commit();
    writeFileSync(join(cwd, 'docs/guide.md'), 'updated');
    const docs = commit();
    assert.deepEqual(flags(detect(runtime, docs)), none);
    assert.deepEqual(flags(detect(base, docs, 'pull_request')), all);
    git(['mv', 'runtime.json', 'docs/runtime.md']);
    const renamed = commit();
    assert.deepEqual(flags(detect(docs, renamed)), all);
    git(['rm', 'docs/runtime.md']);
    const deletedDoc = commit();
    assert.deepEqual(flags(detect(renamed, deletedDoc)), none);
    writeFileSync(join(cwd, 'runtime.json'), '{}');
    const added = commit();
    git(['rm', 'runtime.json']);
    assert.deepEqual(flags(detect(added, commit())), all);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('CLI는 GitHub output과 실행 요약을 기록한다', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'oss-scp-ci-output-'));
  try {
    const event = join(cwd, 'event.json');
    const output = join(cwd, 'output');
    const summary = join(cwd, 'summary');
    writeFileSync(event, '{}');
    execFileSync(process.execPath, [resolve('scripts/ci-scope.mjs')], { env: { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary } });
    assert.equal(readFileSync(output, 'utf8'), 'code=true\nbundle=true\nmock=true\n');
    assert.match(readFileSync(summary, 'utf8'), /수동 전체 검증/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('workflow는 필수 체크·실패 전파·조건부 Docker·릴리스 전체 검증을 연결한다', () => {
  const workflow = readFileSync('.github/workflows/integration-ci.yaml', 'utf8');
  assert.doesNotMatch(workflow, /paths(?:-ignore)?:/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /CI_FULL: \$\{\{ inputs\.full == true \}\}/);
  assert.match(workflow, /full:\n\s+description:.*\n\s+type: boolean\n\s+default: true/);
  for (const [job, name] of [
    ['mysql', 'MySQL 8.4.6 연결 및 migration'],
    ['postgres', 'PostgreSQL 17.6 연결 및 migration'],
    ['local', '로컬 개발 및 배포 빌드'],
    ['docker', 'Docker 빌드 및 실행'],
  ]) {
    const section = workflow.split(`\n  ${job}:\n`)[1]?.split(/\n {2}\w+:\n/)[0];
    assert.ok(section, job);
    assert.ok(section.includes(`name: ${name}`));
    assert.match(section, /needs: changes/);
    assert.match(section, /if: \$\{\{ always\(\) && \(needs\.changes\.result != 'success' \|\| needs\.changes\.outputs\.code == 'true'\) \}\}/);
    assert.match(section, /if: needs\.changes\.result != 'success'\n\s+run: exit 1/);
  }
  assert.equal((workflow.match(/run: pnpm test\n/g) ?? []).length, 1);
  assert.doesNotMatch(workflow, /run: pnpm (?:test:http-collector|test:http-csv-source|--filter @oss-scp\/(?:collector-cli|platform-db) test)/);
  for (const [command, scope] of [['release', 'bundle'], ['bundle', 'bundle'], ['mock', 'mock']]) {
    assert.ok(workflow.includes(`if: needs.changes.outputs.${scope} == 'true'\n        run: pnpm test:docker:${command}`));
  }
  const release = readFileSync('.github/workflows/release.yaml', 'utf8');
  assert.match(release, /uses: \.\/\.github\/workflows\/integration-ci\.yaml\n\s+with:\n\s+full: true/);
});
