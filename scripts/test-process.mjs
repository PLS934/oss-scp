import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(join(tmpdir(), 'oss-scp-process-'));
const children = new Set();
async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function start(command, args, cwd, env = {}) {
  const child = spawn(command, args, {
    cwd, env: { ...process.env, HOST: '127.0.0.1', ...env },
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.output = '';
  child.stdout.on('data', (data) => { child.output += data; });
  child.stderr.on('data', (data) => { child.output += data; });
  child.on('error', (error) => { child.output += error.message; });
  children.add(child);
  return child;
}
async function stop(child) {
  if (child.exitCode === null && child.signalCode === null) {
    process.kill(-child.pid, 'SIGTERM');
    for (let i = 0; i < 50 && child.exitCode === null && child.signalCode === null; i++) await delay(100);
    if (child.exitCode === null && child.signalCode === null) {
      process.kill(-child.pid, 'SIGKILL');
      await once(child, 'exit');
      throw new Error(`종료 신호로 정상 종료하지 못했습니다.\n${child.output}`);
    }
  }
  children.delete(child);
}
async function response(child, port, status = 'ok') {
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(child.output);
    try {
      const result = await fetch(`http://127.0.0.1:${port}/api/v1/health`, { signal: AbortSignal.timeout(500) });
      if (result.status === 200 && (await result.json()).status === status) return;
    } catch { /* 시작 또는 재시작 중에는 다시 확인합니다. */ }
    await delay(100);
  }
  throw new Error(`응답 대기 시간 초과: ${status}\n${child.output}`);
}
async function failedStart(port, pattern) {
  const child = start(process.execPath, ['apps/api/dist/main.js'], root, { PORT: String(port) });
  for (let i = 0; i < 100 && child.exitCode === null; i++) await delay(100);
  assert.notEqual(child.exitCode, null, child.output);
  assert.notEqual(child.exitCode, 0, child.output);
  assert.match(child.output, pattern);
  await stop(child);
}
try {
  const port = await freePort();
  const built = start('pnpm', ['start'], root, { PORT: String(port) });
  await response(built, port);
  await failedStart(port, /EADDRINUSE/);
  await failedStart('invalid', /PORT/);
  await stop(built);
  console.log('배포 실행·사용자 포트·잘못된 포트·포트 충돌·종료: 통과');

  // 사용자 소스를 수정하지 않고, 새 복사본에서 실제 pnpm dev를 실행합니다.
  for (const file of ['package.json', 'pnpm-workspace.yaml']) await cp(join(root, file), join(temporary, file));
  await cp(join(root, 'apps/api'), join(temporary, 'apps/api'), {
    recursive: true, filter: (path) => !path.includes('/node_modules') && !path.includes('/dist'),
  });
  await symlink(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir');
  await symlink(join(root, 'apps/api/node_modules'), join(temporary, 'apps/api/node_modules'), 'dir');
  const watchPort = await freePort();
  await writeFile(join(temporary, '.env'), `HOST=127.0.0.1\nPORT=${watchPort}\n`);
  const watch = start('pnpm', ['dev'], temporary, { PORT: undefined, HOST: undefined });
  await response(watch, watchPort);
  const source = join(temporary, 'apps/api/src/health.service.ts');
  await writeFile(source, (await readFile(source, 'utf8')).replace("status: 'ok'", "status: 'changed'"));
  await response(watch, watchPort, 'changed');
  await stop(watch);
  console.log('루트 .env 로딩·Nest watch 자동 재시작·변경 응답·종료: 통과');
} finally {
  for (const child of children) await stop(child);
  await rm(temporary, { recursive: true, force: true });
}
