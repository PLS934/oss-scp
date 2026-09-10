import assert from 'node:assert/strict';
import { readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { run } from './web-test-helpers.mjs';

export async function workspaceModuleTargets(dir) {
  dir = await realpath(dir);
  const packages = JSON.parse(await run('pnpm', ['list', '-r', '--depth', '-1', '--json'], { cwd: dir }));
  return [...new Set([dir, ...packages.map(pkg => pkg.path)])].map(directory =>
    path.posix.join('/workspace', path.relative(dir, directory).split(path.sep).join('/'), 'node_modules'));
}

// Compose의 병합 결과를 검사하므로 profile과 override도 실제 실행과 같다.
export function assertWorkspaceVolumes(config, targets) {
  const owners = new Map();
  const services = new Set(['api', 'web', 'mock-api']);
  for (const [name, service] of Object.entries(config.services)) {
    if (JSON.stringify(service.command ?? '').includes('pnpm install')) services.add(name);
  }
  for (const name of services) {
    for (const target of targets) {
      const mount = config.services[name]?.volumes?.find(volume => volume.target === target);
      assert.ok(mount?.type === 'volume' && mount.source && !mount.read_only,
        `${name}: ${target}에 쓰기 가능한 전용 named volume이 필요합니다. compose.dev.yaml을 갱신하세요.`);
      assert.ok(!owners.has(mount.source), `${name}: ${target} 볼륨을 ${owners.get(mount.source)}와 공유할 수 없습니다.`);
      owners.set(mount.source, `${name}:${target}`);
    }
  }
}

export async function checkWorkspaceVolumes(dir, compose) {
  const targets = await workspaceModuleTargets(dir);
  const config = JSON.parse(await compose(['config', '--format', 'json'], true));
  assertWorkspaceVolumes(config, targets);
  return targets;
}

export async function assertDependencyMounts(compose, docker, services, targets) {
  for (const service of services) {
    const id = (await compose(['ps', '-q', service], true)).trim();
    const container = JSON.parse(await docker(['inspect', id]))[0];
    for (const target of targets) {
      assert.ok(container.Mounts.some(mount => mount.Destination === target && mount.Type === 'volume' && mount.RW),
        `${service}: ${target}가 실제 의존성 볼륨에 마운트되지 않았습니다.`);
    }
    const store = (await compose(['exec', '-T', service, 'pnpm', 'store', 'path'], true)).trim();
    assert.ok(store.startsWith('/workspace/node_modules/.pnpm-store/'), `${service}: 잘못된 pnpm store 경로 ${store}`);
  }
}

// Docker의 빈 mountpoint는 허용하되 파일·링크·캐시가 호스트에 생기면 실패한다.
export async function assertCleanDependencyPaths(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const location = path.join(dir, entry.name);
    if (['node_modules', '.pnpm-store'].includes(entry.name)) {
      assert.ok(entry.isDirectory(), `${location}: 호스트에 의존성 링크 또는 파일이 생성됐습니다.`);
      assert.deepEqual(await readdir(location), [], `${location}: 호스트에 의존성 파일이 생성됐습니다.`);
    } else if (entry.isDirectory() && entry.name !== '.git') {
      await assertCleanDependencyPaths(location);
    }
  }
}
