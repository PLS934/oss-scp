import assert from 'node:assert/strict';
import test from 'node:test';
import { createBundleManifest, readBundleManifest, validateBundleManifest } from './bundle-manifest.mjs';

const revision = 'a'.repeat(40);
const digest = `sha256:${'b'.repeat(64)}`;
const baseImages = [
  { name: 'api', reference: 'oss-scp-api:0.1.0', digest },
  { name: 'web', reference: 'oss-scp-web:0.1.0', digest: `sha256:${'c'.repeat(64)}` },
];

test('기존 DB manifest를 생성하고 읽는다', () => {
  const manifest = createBundleManifest({ productVersion: '0.1.0', gitRevision: revision, variant: 'existing-db', createdAt: '2026-09-13T00:00:00Z', images: baseImages });
  assert.deepEqual(manifest.support.databases, ['postgresql:17.6', 'mysql:8.4.6']);
  assert.deepEqual(readBundleManifest(JSON.stringify(manifest)), manifest);
});

test('PostgreSQL 포함 manifest는 DB 이미지를 요구한다', () => {
  assert.throws(() => createBundleManifest({ productVersion: '0.1.0', gitRevision: revision, variant: 'postgresql', createdAt: '2026-09-13T00:00:00Z', images: baseImages }), /PostgreSQL/);
  const manifest = createBundleManifest({ productVersion: '0.1.0-rc.1', gitRevision: revision, variant: 'postgresql', createdAt: '2026-09-13T00:00:00Z', images: [...baseImages, { name: 'postgresql', reference: 'postgres:17.6-bookworm', digest: `sha256:${'d'.repeat(64)}` }] });
  assert.deepEqual(manifest.support.databases, ['postgresql:17.6']);
});

test('잘못된 schema, version, revision, variant와 digest를 거부한다', () => {
  const valid = createBundleManifest({ productVersion: '0.1.0', gitRevision: revision, variant: 'existing-db', createdAt: '2026-09-13T00:00:00Z', images: baseImages });
  for (const change of [
    { schemaVersion: 2 }, { productVersion: 'v0.1.0' }, { gitRevision: 'abc' }, { variant: 'external' }, { createdAt: 'not-a-date' },
    { images: [{ ...baseImages[0], digest: 'bad' }, baseImages[1]] },
  ]) assert.throws(() => validateBundleManifest({ ...valid, ...change }));
  assert.throws(() => readBundleManifest('{'), /JSON/);
});
