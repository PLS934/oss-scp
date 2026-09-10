import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const env = { ...process.env, PLATFORM_DB_PASSWORD: 'compose-config-check' };
function config(files, extraEnv = {}) {
  const args = ['compose', ...files.flatMap(file => ['-f', file]), 'config', '--format', 'json'];
  return JSON.parse(execFileSync('docker', args, { encoding: 'utf8', env: { ...env, ...extraEnv } }));
}
function common(service) {
  return { image: service.image, build: service.build, ports: service.ports };
}

const bundled = config(['compose.yaml']);
const external = config(['compose.external-db.yaml']);
assert.deepEqual(Object.keys(external.services).sort(), ['api', 'web']);
assert.equal(external.volumes, undefined);
assert.deepEqual(common(external.services.api), common(bundled.services.api));
assert.deepEqual(common(external.services.web), common(bundled.services.web));
assert.deepEqual(external.services.web.environment, bundled.services.web.environment);

const secret = config(['compose.external-db.yaml', 'compose.external-db.secret.yaml'], {
  PLATFORM_DB_PASSWORD: undefined,
  PLATFORM_DB_PASSWORD_FILE_HOST: '/tmp/compose-config-secret',
});
assert.equal(secret.services.api.environment.PLATFORM_DB_PASSWORD, undefined);
assert.equal(secret.services.api.environment.PLATFORM_DB_PASSWORD_FILE, '/run/secrets/platform_db_password');
assert.ok(secret.services.api.volumes.some(volume => volume.target === '/run/secrets/platform_db_password' && volume.read_only));
console.log('내장·외부 Compose 공통 설정과 secret 마운트 계약 통과');
