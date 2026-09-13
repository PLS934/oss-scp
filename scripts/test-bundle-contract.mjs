import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const existing = await readFile('release/bundle/compose-existing-db.yaml', 'utf8');
const postgres = await readFile('release/bundle/compose-postgresql.yaml', 'utf8');
for (const compose of [existing, postgres]) {
  assert.doesNotMatch(compose, /^\s*build:/m);
  assert.doesNotMatch(compose, /mock-api/);
  assert.match(compose, /pull_policy: never/g);
  assert.match(compose, /:\/config:ro/);
  assert.match(compose, /oss-scp-api:\$\{OSS_SCP_VERSION/);
  assert.match(compose, /oss-scp-web:\$\{OSS_SCP_VERSION/);
}
assert.doesNotMatch(existing, /^\s*postgres:/m);
assert.doesNotMatch(existing, /platform_db_data/);
assert.match(postgres, /^\s*postgres:/m);
assert.match(postgres, /platform_db_data/);
assert.match(postgres, /OSS_SCP_POSTGRES_IMAGE/);

for (const name of ['env-existing-db.example', 'env-postgresql.example']) {
  const text = await readFile(`release/bundle/${name}`, 'utf8');
  assert.match(text, /^PLATFORM_DB_PASSWORD=$/m);
  assert.doesNotMatch(text, /(password|token)=.+/i);
}
const names = await readdir('release/bundle');
assert.equal(names.some(name => /\.(tsx?|json)$/.test(name)), false);
console.log('번들 Compose·환경 예시·비밀정보 경계: 통과');
