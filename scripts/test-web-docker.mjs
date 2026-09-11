import assert from 'node:assert/strict';
import { chmod, cp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import { chromium, expect } from '@playwright/test';
import { fixture, port, run, waitFor, healthy } from './web-test-helpers.mjs';
import { checkWorkspaceVolumes, assertDependencyMounts, assertCleanDependencyPaths } from './docker-workspace-checks.mjs';

await run('pnpm', ['build:plugin-transforms'], { cwd: process.cwd(), env: process.env });
const dir = await fixture();
await chmod(dir, 0o755);
for (const plugin of ['sample1-offset-api', 'sample2-single-api', 'vulnerabilities-local-csv', 'vulnerabilities-http-csv']) {
  await cp(path.join(process.cwd(), 'plugins', plugin, 'dist'), path.join(dir, 'plugins', plugin, 'dist'), { recursive: true });
}
const project = `oss-scp-web-check-${process.pid}`;
const standalone = `${project}-standalone`;
const alternate = `${project}-alternate`;
const webPort = await port();
const apiPort = await port();
const env = { ...process.env, WEB_PORT: String(webPort), API_PORT: String(apiPort), PLATFORM_DB_PASSWORD: 'web-docker-test-password', OSS_SCP_CONFIG_PATH: dir };
const base = ['compose', '-p', project, '-f', 'compose.yaml'];
const dev = [...base, '-f', 'compose.dev.yaml'];
const docker = args => run('docker', args, { cwd: dir, env });
const compose = (args, development = false) => docker([...(development ? dev : base), ...args]);
const url = `http://127.0.0.1:${webPort}`;
const hostAddress = process.env.TEST_HOST_ADDRESS || Object.values(networkInterfaces()).flat().find(address => address?.family === 'IPv4' && !address.internal)?.address;
assert.ok(hostAddress, '외부 인터페이스가 없으면 TEST_HOST_ADDRESS로 테스트 호스트 주소를 지정하세요.');
let browser;
try {
  // mock profile도 포함하여 workspace install을 수행하는 모든 서비스를 검사한다.
  const targets = await checkWorkspaceVolumes(dir, args => docker([...dev, '--profile', 'mock', ...args]));
  const prodConfig = JSON.parse(await compose(['config', '--format', 'json']));
  const devConfig = JSON.parse(await compose(['config', '--format', 'json'], true));
  assert.equal(prodConfig.services.web.ports[0].host_ip, '0.0.0.0');
  assert.equal(devConfig.services.web.ports.length, 1);
  assert.equal(devConfig.services.web.ports[0].host_ip, '127.0.0.1');
  assert.equal(devConfig.services.web.environment.API_PROXY_TARGET, 'http://api:3000');
  assert.equal(devConfig.services.web.environment.API_UPSTREAM, undefined);
  await compose(['up', '--build', '-d', '--wait', '--wait-timeout', '180']);
  await waitFor(() => healthy(url), '배포 프록시');
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => console.error('browser error:', error));
  await page.goto(url);
  await expect(page.getByRole('status')).toHaveText('서버 연결 성공');
  assert.equal((await fetch(`${url}/api/unknown`)).status, 404);
  await page.goto(`${url}/assets/servers`);
  await expect(page.getByRole('heading', { name: '서버 자산', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('플랫폼 데이터를 조회할 수 없습니다');
  await page.reload();
  await expect(page.getByRole('heading', { name: '서버 자산', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('플랫폼 데이터를 조회할 수 없습니다');
  await page.goto(`${url}/unknown-menu`);
  await expect(page.getByRole('heading', { name: '페이지를 찾을 수 없습니다' })).toBeVisible();
  await page.goto(url);

  // 별도 네트워크 클라이언트가 호스트 공개 포트에 접근한다.
  const probe = ['run', '--rm', 'oss-scp-api:local', 'node', '-e'];
  await docker([...probe, `fetch('http://${hostAddress}:${webPort}/api/v1/health', {signal: AbortSignal.timeout(5000)}).then(async r => {if(r.status !== 200 || (await r.json()).status !== 'ok') process.exit(1)}).catch(() => process.exit(1))`]);

  await compose(['stop', 'api']);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('서버 연결 실패', { timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'OSS-SCP', exact: true })).toBeVisible();
  await compose(['up', '-d', '--force-recreate', 'api']);
  await waitFor(() => healthy(url), 'API 재생성 후 DNS 복구');
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('서버 연결 성공');

  await docker(['run', '-d', '--name', standalone, '-p', '127.0.0.1::8080', 'oss-scp-web:local']);
  const standaloneAddress = (await docker(['port', standalone, '8080/tcp'])).trim();
  await waitFor(async () => (await fetch(`http://${standaloneAddress}`)).ok, 'API 없는 이미지');
  await page.goto(`http://${standaloneAddress}`);
  await expect(page.getByRole('status')).toHaveText('서버 연결 실패', { timeout: 10000 });
  const inspection = JSON.parse(await docker(['inspect', standalone]))[0];
  assert.equal(inspection.Mounts.length, 0);
  await docker(['exec', standalone, 'sh', '-c', 'test "$(id -u)" != 0 && test ! -e /usr/share/nginx/html/src && test ! -e /usr/share/nginx/html/.env && ! command -v node']);

  const apiId = (await compose(['ps', '-q', 'api'])).trim();
  const apiAddress = JSON.parse(await docker(['inspect', apiId]))[0].NetworkSettings.Networks[`${project}_default`].IPAddress;
  await docker(['run', '-d', '--name', alternate, '--network', `${project}_default`, '-e', `API_UPSTREAM=${apiAddress}:3000`, '-p', '127.0.0.1::8080', 'oss-scp-web:local']);
  const alternateAddress = (await docker(['port', alternate, '8080/tcp'])).trim();
  await waitFor(() => healthy(`http://${alternateAddress}`), '같은 이미지의 upstream 변경');
  assert.equal(JSON.parse(await docker(['inspect', alternate]))[0].Image, inspection.Image);
  await docker(['rm', '-f', standalone, alternate]);
  await compose(['down', '--remove-orphans']);

  await compose(['up', '--build', '-d', '--wait', '--wait-timeout', '240'], true);
  await waitFor(() => healthy(url), 'Docker 개발 API');
  const ids = await compose(['ps', '-q'], true);
  await page.goto(url);
  await expect(page.getByRole('status')).toHaveText('서버 연결 성공');
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('/@vite/client')));
  await page.evaluate(() => { document.documentElement.dataset.hmrCheck = 'docker'; });
  const appFile = path.join(dir, 'apps/web/src/App.tsx');
  await writeFile(appFile, (await readFile(appFile, 'utf8')).replace('OSS-SCP</NavLink>', 'Docker HMR 확인</NavLink>'));
  await expect(page.getByRole('heading', { name: 'Docker HMR 확인' })).toBeVisible({ timeout: 20000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.hmrCheck), 'docker');
  const healthFile = path.join(dir, 'apps/api/src/health.service.ts');
  const original = await readFile(healthFile, 'utf8');
  await writeFile(healthFile, original.replace("status: 'ok'", "status: 'watch-check'"));
  await waitFor(async () => (await (await fetch(`${url}/api/v1/health`)).json()).status === 'watch-check', '서버 watch');
  await writeFile(healthFile, original);
  await waitFor(() => healthy(url), '서버 watch 복구');
  assert.equal(await compose(['ps', '-q'], true), ids);

  // 임시 프로젝트의 패키지와 잠금 파일을 바꾼 뒤 재시작으로 설치한다.
  const packageFile = path.join(dir, 'apps/web/package.json');
  const manifest = JSON.parse(await readFile(packageFile, 'utf8'));
  manifest.devDependencies['@playwright/test'] = '1.63.0';
  await writeFile(packageFile, JSON.stringify(manifest, null, 2) + '\n');
  await run('pnpm', ['install', '--lockfile-only'], { cwd: dir, env });
  await compose(['restart', 'api', 'web'], true);
  await waitFor(async () => {
    await compose(['exec', '-T', 'web', 'test', '-L', '/workspace/apps/web/node_modules/@playwright/test'], true);
    return healthy(url);
  }, '개발 의존성 재설치', 60000);

  await assertDependencyMounts(compose, docker, ['api', 'web'], targets);
  await assertCleanDependencyPaths(dir);

  // localhost 전용 개발 포트는 별도 네트워크 클라이언트에서 열리지 않아야 한다.
  await docker([...probe, `fetch('http://${hostAddress}:${webPort}/', {signal: AbortSignal.timeout(3000)}).then(() => process.exit(1)).catch(() => process.exit(0))`]);
  console.log('Docker: 배포 화면·프록시·장애/복구·단독 실행·upstream·외부 접속·개발 loopback·HMR·watch·의존성 재설치 통과');
} catch (error) {
  console.error(await compose(['logs', '--tail', '60'], true).catch(() => '로그 조회 실패'));
  throw error;
} finally {
  await browser?.close();
  await docker(['rm', '-f', standalone, alternate]).catch(() => {});
  await compose(['down', '-v', '--remove-orphans'], true);
  for (const resource of [['ps', '-aq'], ['volume', 'ls', '-q']]) {
    assert.equal((await docker([...resource, '--filter', `label=com.docker.compose.project=${project}`])).trim(), '');
  }
  await assertCleanDependencyPaths(dir);
  await rm(dir, { recursive: true, force: true });
}
