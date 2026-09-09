import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  fixture,
  port,
  run,
  start,
  stop,
  waitFor,
} from './web-test-helpers.mjs';
function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(3000),
  });
}

const dir = await fixture(true);
const mockPort = await port();
const env = {
  ...process.env,
  MOCK_PORT: String(mockPort),
  MOCK_HOST: '127.0.0.1',
};
const url = `http://127.0.0.1:${mockPort}`;
let proc;
try {
  for (const relative of [
    'sources/sample1.json',
    'sources/sample2.json',
    'csv/vulnerabilities.csv',
  ]) {
    const missing = path.join(dir, 'fixtures', relative);
    const content = await readFile(missing);
    await rm(missing);
    try {
      proc = start('pnpm', ['dev:mock'], { cwd: dir, env });
      await waitFor(
        () => proc.child.exitCode !== null,
        `fixture 누락 시 개발 실행 종료: ${relative}`,
        15000,
      );
      assert.notEqual(proc.child.exitCode, 0);
      assert.match(proc.output(), /ENOENT/);
      assert.ok(!proc.output().includes('Mock API ready'));
      await assert.rejects(
        fetchWithTimeout(`${url}/sample1`, {
          signal: AbortSignal.timeout(1000),
        }),
      );
    } finally {
      await stop(proc);
      await writeFile(missing, content);
    }
  }
  await run('pnpm', ['--filter', '@oss-scp/mock-api', 'build'], {
    cwd: dir,
    env,
  });
  proc = start('pnpm', ['dev:mock'], {
    cwd: dir,
    env: { ...env, MOCK_PORT: 'invalid' },
  });
  await waitFor(() => proc.child.exitCode !== null, '잘못된 개발 포트 종료');
  assert.notEqual(proc.child.exitCode, 0);
  assert.match(proc.output(), /MOCK_PORT/);
  proc = start(
    process.execPath,
    [path.join(dir, 'apps/mock-api/dist/main.js')],
    { cwd: '/', env },
  );
  await waitFor(
    async () => (await fetchWithTimeout(`${url}/sample1`)).ok,
    '별도 cwd 실행',
  );
  await stop(proc);
  proc = start('pnpm', ['dev:mock'], { cwd: dir, env });
  await waitFor(
    async () => (await fetchWithTimeout(`${url}/sample2`)).ok,
    '로컬 개발 실행',
  );
  const file = path.join(dir, 'fixtures/sources/sample2.json');
  const sample = JSON.parse(await readFile(file));
  sample.test_field6 = !sample.test_field6;
  await writeFile(file, JSON.stringify(sample));
  await waitFor(
    async () =>
      (await (await fetchWithTimeout(`${url}/sample2`)).json()).test_field6 ===
      sample.test_field6,
    'fixture 변경',
    60000,
  );
  const source = path.join(dir, 'apps/mock-api/src/app.ts');
  await writeFile(
    source,
    (await readFile(source, 'utf8')).replace(
      "@Get('sample2')",
      "@Get('changed')",
    ),
  );
  await waitFor(
    async () => (await fetchWithTimeout(`${url}/changed`)).ok,
    '소스 변경',
    60000,
  );
  await stop(proc);
  await waitFor(async () => {
    try {
      await fetchWithTimeout(`${url}/sample1`);
      return false;
    } catch {
      return true;
    }
  }, '종료 후 포트 해제');
  assert.equal(
    proc.child.exitCode === null && proc.child.signalCode === null,
    false,
  );
  console.log('mock 프로세스·cwd·소스 및 fixture 변경 검증 통과');
} catch (error) {
  console.error(proc?.output());
  throw error;
} finally {
  await stop(proc);
  await rm(dir, { recursive: true, force: true });
}
