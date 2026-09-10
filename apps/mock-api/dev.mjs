import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const cwd = fileURLToPath(new URL('.', import.meta.url));
let buildProcess;
let serverProcess;
let stopping = false;

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    await done;
  } finally {
    clearTimeout(timer);
  }
}
async function stopServer() {
  const server = serverProcess;
  serverProcess = undefined;
  await stopProcess(server);
}
async function runBuild() {
  const build = spawn('pnpm', ['build'], { cwd, stdio: 'inherit' });
  buildProcess = build;
  try {
    return await new Promise((resolve, reject) => {
      build.once('exit', resolve);
      build.once('error', reject);
    });
  } finally {
    buildProcess = undefined;
  }
}
function startServer() {
  const server = spawn(process.execPath, ['dist/main.js'], {
    cwd,
    stdio: 'inherit',
  });
  serverProcess = server;
  server.on('exit', (code) => {
    if (code !== null && code !== 0 && serverProcess === server && !stopping) {
      stopping = true;
      process.exitCode = code;
    }
  });
  server.on('error', (error) => {
    console.error(error.message);
    stopping = true;
    process.exitCode = 1;
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    void stopProcess(buildProcess);
    void stopServer();
  });
}
function fingerprint() {
  const hash = createHash('sha256');
  for (const base of ['src/', '../../fixtures/']) {
    const root = new URL(base, import.meta.url);
    for (const file of readdirSync(root, { recursive: true }).sort()) {
      if (!/\.(ts|json|csv)$/.test(file)) continue;
      hash.update(file).update(readFileSync(new URL(file, root)));
    }
  }
  for (const file of ['tsconfig.json', 'copy-fixtures.mjs'])
    hash.update(readFileSync(new URL(file, import.meta.url)));
  return hash.digest('hex');
}
let previous;
let initialBuild = true;
while (!stopping) {
  let next;
  try {
    next = fingerprint();
  } catch {
    next = 'missing-input';
  }
  if (next !== previous) {
    previous = next;
    await stopServer();
    if (stopping) break;
    const code = await runBuild();
    // 최초 빌드 실패는 실행 실패로 전달한다. 실행 후 편집 중의 컴파일 오류는 계속 감시한다.
    if (initialBuild && code !== 0 && !stopping) {
      process.exitCode = code ?? 1;
      break;
    }
    initialBuild = false;
    if (code === 0 && !stopping) startServer();
  }
  await delay(500);
}
await stopServer();
