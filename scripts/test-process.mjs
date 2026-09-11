import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(join(tmpdir(), 'oss-scp-process-'));
const children = new Set();
const dbContainer = `oss-scp-process-db-${process.pid}`;
let dbEnv;
function docker(...args) { return execFileSync('docker', args, { encoding: 'utf8' }).trim(); }
async function startDatabase() {
  docker('run', '-d', '--name', dbContainer, '-e', 'POSTGRES_DB=oss_scp', '-e', 'POSTGRES_USER=oss_scp_app', '-e', 'POSTGRES_PASSWORD=process-password', '-p', '127.0.0.1::5432', 'postgres:17.6-bookworm');
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { docker('exec', dbContainer, 'pg_isready', '-U', 'oss_scp_app', '-d', 'oss_scp'); ready = true; break; } catch { await delay(100); }
  }
  assert.equal(ready, true, 'PostgreSQL 컨테이너가 준비되지 않았습니다.');
  const address = docker('port', dbContainer, '5432/tcp');
  dbEnv = { PLATFORM_DB_TYPE: 'postgres', PLATFORM_DB_HOST: address.slice(0, address.lastIndexOf(':')), PLATFORM_DB_PORT: address.slice(address.lastIndexOf(':') + 1), PLATFORM_DB_NAME: 'oss_scp', PLATFORM_DB_USER: 'oss_scp_app', PLATFORM_DB_PASSWORD: 'process-password', PLATFORM_DB_TLS_MODE: 'disable' };
  for (let i = 0; i < 100; i++) {
    if (await canConnect(dbEnv.PLATFORM_DB_HOST, dbEnv.PLATFORM_DB_PORT)) return;
    await delay(100);
  }
  throw new Error('PostgreSQL 호스트 포트가 준비되지 않았습니다.');
}
async function canConnect(host, port) {
  return new Promise(resolve => {
    const socket = createConnection({ host, port: Number(port) });
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}
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
    cwd, env: { ...process.env, HOST: '127.0.0.1', ...dbEnv, ...env },
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
async function failedStart(port, pattern, env = {}) {
  const child = start(process.execPath, ['apps/api/dist/main.js'], root, { PORT: String(port), ...env });
  for (let i = 0; i < 100 && child.exitCode === null; i++) await delay(100);
  assert.notEqual(child.exitCode, null, child.output);
  assert.notEqual(child.exitCode, 0, child.output);
  assert.match(child.output, pattern);
  await stop(child);
}
try {
  await startDatabase();
  const port = await freePort();
  const built = start('pnpm', ['start'], root, { PORT: String(port) });
  await response(built, port);
  await failedStart(port, /EADDRINUSE/);
  await failedStart('invalid', /PORT/);
  await failedStart(await freePort(), /플랫폼 DB에 연결할 수 없습니다/, { PLATFORM_DB_PASSWORD: 'sensitive-wrong-password' });
  await stop(built);
  console.log('배포 실행·사용자 포트·잘못된 포트·포트 충돌·종료: 통과');

  // 사용자 소스를 수정하지 않고, 새 복사본에서 실제 pnpm dev를 실행합니다.
  for (const file of ['package.json', 'pnpm-workspace.yaml']) await cp(join(root, file), join(temporary, file));
  await cp(join(root, 'apps/api'), join(temporary, 'apps/api'), {
    recursive: true, filter: (path) => !path.includes('/node_modules') && !path.includes('/dist'),
  });
  await cp(join(root, 'packages/platform-db'), join(temporary, 'packages/platform-db'), {
    recursive: true, filter: (path) => !path.includes('/node_modules'),
  });
  await symlink(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir');
  await symlink(join(root, 'apps/api/node_modules'), join(temporary, 'apps/api/node_modules'), 'dir');
  const watchPort = await freePort();
  await writeFile(join(temporary, '.env'), `HOST=127.0.0.1\nPORT=${watchPort}\nPLATFORM_DB_TYPE=postgres\nPLATFORM_DB_HOST=${dbEnv.PLATFORM_DB_HOST}\nPLATFORM_DB_PORT=${dbEnv.PLATFORM_DB_PORT}\nPLATFORM_DB_NAME=oss_scp\nPLATFORM_DB_USER=oss_scp_app\nPLATFORM_DB_PASSWORD=process-password\nPLATFORM_DB_TLS_MODE=disable\n`);
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
  try { docker('rm', '-f', dbContainer); } catch { /* 테스트 DB가 시작되지 않았을 수 있다. */ }
}
