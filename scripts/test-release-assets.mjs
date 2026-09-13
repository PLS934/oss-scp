import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname;

test('배포 Compose와 환경 예시는 릴리스 계약만 포함한다', () => {
  const compose = readFileSync(join(root, 'release/compose.yaml'), 'utf8');
  const environment = readFileSync(join(root, 'release/env.example'), 'utf8');
  assert.match(compose, /oss-scp-api:\$\{OSS_SCP_VERSION:\?/);
  assert.match(compose, /oss-scp-web:\$\{OSS_SCP_VERSION:\?/);
  assert.match(compose, /OSS_SCP_CONFIG_PATH.*:\/config:ro/);
  assert.match(compose, /platform_db_data:\/var\/lib\/postgresql\/data/);
  assert.doesNotMatch(compose, /\bbuild:/);
  assert.doesNotMatch(compose, /mock-api/);
  assert.match(environment, /^OSS_SCP_VERSION=0\.1\.0$/m);
  assert.match(environment, /^PLATFORM_DB_PASSWORD=$/m);
  assert.doesNotMatch(environment, /password=.+/i);
});

test('잘못된 입력과 기존 출력 경로는 Docker 실행 전에 거부한다', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'oss-scp-release-contract-'));
  try {
    const invalid = spawnSync('bash', ['scripts/build-release-assets.sh', '01.0.0', 'a'.repeat(40), join(temporary, 'invalid')], { cwd: root, encoding: 'utf8' });
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /지원하지 않는 릴리스 태그/);
    const existing = join(temporary, 'existing');
    mkdirSync(existing);
    const duplicate = spawnSync('bash', ['scripts/build-release-assets.sh', '0.1.0', 'a'.repeat(40), existing], { cwd: root, encoding: 'utf8' });
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /이미 존재/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
