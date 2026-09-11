import { spawn } from 'node:child_process';
import { chmod, cp, mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function port() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const result = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return result;
}
export function start(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, ...options, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => resolve(code));
  });
  // 종료 대기 전 spawn 오류가 unhandled rejection으로 처리되지 않도록 한다.
  done.catch(() => {});
  return { child, done, output: () => output };
}
export async function stop(proc) {
  if (!proc || proc.child.exitCode !== null) return;
  try { process.kill(-proc.child.pid, 'SIGTERM'); } catch { return; }
  await Promise.race([proc.done, delay(2000)]);
  try { process.kill(-proc.child.pid, 'SIGKILL'); } catch { /* 이미 종료됨 */ }
}
export async function run(command, args, options) {
  const proc = start(command, args, options);
  const code = await proc.done;
  if (code !== 0) throw new Error(`${command} ${args.join(' ')} (${code})\n${proc.output()}`);
  return proc.output();
}
export async function waitFor(check, description, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try { if (await check()) return; } catch { /* 기동 중 */ }
    await delay(200);
  }
  throw new Error(`대기 시간 초과: ${description}`);
}
export async function healthy(url) {
  try {
    const response = await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(1500) });
    return response.status === 200 && (await response.json()).status === 'ok';
  } catch { return false; }
}
export async function fixture(linkModules = false) {
  const dir = await mkdtemp(path.join(tmpdir(), 'oss-scp-web-'));
  await chmod(dir, 0o755);
  await cp(root, dir, {
    recursive: true,
    filter: source => {
      const parts = path.relative(root, source).split(path.sep);
      const pluginBuild = parts[0] === 'plugins' && parts.includes('dist');
      return !parts.some(part =>
        ['.git', '.pnpm-store', 'node_modules', '.env', '.DS_Store', 'test-results', 'playwright-report'].includes(part)
        || (part === 'dist' && !pluginBuild)
        || (part.startsWith('.env.') && part !== '.env.example'));
    },
  });
  if (linkModules) {
    for (const relative of [
      'node_modules', 'apps/api/node_modules', 'apps/web/node_modules', 'apps/mock-api/node_modules',
      'packages/plugin-config/node_modules', 'packages/plugin-sdk/node_modules',
      'packages/http-csv-source/node_modules',
      'plugins/sample1-offset-api/node_modules', 'plugins/sample2-single-api/node_modules',
      'plugins/vulnerabilities-local-csv/node_modules',
      'plugins/vulnerabilities-http-csv/node_modules',
    ]) {
      await symlink(path.join(root, relative), path.join(dir, relative), 'dir');
    }
  }
  return dir;
}
