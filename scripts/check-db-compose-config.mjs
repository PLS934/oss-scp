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
const mysql = config(['compose.mysql.yaml'], { MYSQL_ROOT_PASSWORD: 'compose-root-check' });
const mysqlExternal = config(['compose.external-db.mysql.yaml']);
assert.deepEqual(Object.keys(external.services).sort(), ['api', 'web']);
assert.equal(external.volumes, undefined);
assert.deepEqual(common(external.services.api), common(bundled.services.api));
assert.deepEqual(common(external.services.web), common(bundled.services.web));
assert.deepEqual(external.services.web.environment, bundled.services.web.environment);
assert.deepEqual(Object.keys(mysql.services).sort(), ['api', 'mysql', 'web']);
assert.equal(mysql.services.postgres, undefined);
assert.equal(mysql.volumes.platform_mysql_data.name.endsWith('_platform_mysql_data'), true);
assert.equal(mysql.services.api.environment.PLATFORM_DB_TYPE, 'mysql');
assert.deepEqual(Object.keys(mysqlExternal.services).sort(), ['api', 'web']);
assert.equal(mysqlExternal.volumes, undefined);
assert.equal(mysqlExternal.services.api.environment.PLATFORM_DB_TYPE, 'mysql');
assert.deepEqual(common(mysqlExternal.services.api), common(bundled.services.api));
assert.deepEqual(common(mysqlExternal.services.web), common(bundled.services.web));

const secret = config(['compose.external-db.yaml', 'compose.external-db.secret.yaml'], {
  PLATFORM_DB_PASSWORD: undefined,
  PLATFORM_DB_PASSWORD_FILE_HOST: '/tmp/compose-config-secret',
});
assert.equal(secret.services.api.environment.PLATFORM_DB_PASSWORD, undefined);
assert.equal(secret.services.api.environment.PLATFORM_DB_PASSWORD_FILE, '/run/secrets/platform_db_password');
assert.ok(secret.services.api.secrets.some(value => value.source === 'platform_db_password' && value.target === '/run/secrets/platform_db_password'));
assert.equal(secret.secrets.platform_db_password.file, '/tmp/compose-config-secret');
const mysqlSecret = config(['compose.external-db.mysql.yaml', 'compose.external-db.mysql.secret.yaml'], {
  PLATFORM_DB_PASSWORD: undefined,
  PLATFORM_DB_PASSWORD_FILE_HOST: '/tmp/compose-config-secret',
});
assert.equal(mysqlSecret.services.api.environment.PLATFORM_DB_TYPE, 'mysql');
assert.equal(mysqlSecret.services.api.environment.PLATFORM_DB_PASSWORD, undefined);
assert.equal(mysqlSecret.services.api.environment.PLATFORM_DB_PASSWORD_FILE, '/run/secrets/platform_db_password');
console.log('PostgreSQL·MySQL 내장/외부 Compose와 secret 마운트 계약 통과');
