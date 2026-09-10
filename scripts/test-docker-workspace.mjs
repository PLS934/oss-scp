import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fixture, run } from './web-test-helpers.mjs';
import { assertWorkspaceVolumes, checkWorkspaceVolumes, assertCleanDependencyPaths } from './docker-workspace-checks.mjs';

const dir = await fixture();
const compose = args => run('docker', ['compose', '-f', 'compose.yaml', '-f', 'compose.dev.yaml', '--profile', 'mock', ...args], { cwd: dir, env: { ...process.env, PLATFORM_DB_PASSWORD: 'workspace-test-password' } });
try {
  const targets = await checkWorkspaceVolumes(dir, compose);
  const config = JSON.parse(await compose(['config', '--format', 'json']));
  for (const service of ['api', 'web', 'mock-api']) {
    const broken = JSON.parse(JSON.stringify(config));
    broken.services[service].volumes = broken.services[service].volumes.filter(volume => volume.target !== '/workspace/packages/plugin-config/node_modules');
    assert.throws(() => assertWorkspaceVolumes(broken, targets), /plugin-config\/node_modules/);
  }
  const shared = JSON.parse(JSON.stringify(config));
  shared.services.web.volumes.find(volume => volume.target === targets[0]).source =
    shared.services.api.volumes.find(volume => volume.target === targets[0]).source;
  assert.throws(() => assertWorkspaceVolumes(shared, targets), /공유/);

  // 새 workspace를 실제 pnpm 검색으로 발견하고 볼륨 누락을 기동 전에 차단한다.
  const added = path.join(dir, 'packages/volume-regression');
  await mkdir(added, { recursive: true });
  await writeFile(path.join(added, 'package.json'), JSON.stringify({ name: '@oss-scp/volume-regression', version: '0.0.0' }));
  await assert.rejects(checkWorkspaceVolumes(dir, compose), /volume-regression\/node_modules/);
  const modules = path.join(added, 'node_modules');
  await mkdir(modules);
  await assertCleanDependencyPaths(dir);
  await writeFile(path.join(modules, 'root-owned-regression'), 'unexpected dependency');
  await assert.rejects(assertCleanDependencyPaths(dir), /호스트에 의존성 파일/);
  console.log('Docker workspace: 전체 서비스 볼륨·공유 차단·새 패키지 누락·호스트 오염 회귀 검사 통과');
} finally {
  await rm(dir, { recursive: true, force: true });
}
