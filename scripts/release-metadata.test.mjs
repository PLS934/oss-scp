import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseMetadata } from './release-metadata.mjs';
import { verifyReleaseLabels } from './verify-release-image.mjs';

const revision = 'a'.repeat(40);

test('0.x 안정 버전은 기술 프리뷰 prerelease다', () => {
  assert.deepEqual(releaseMetadata('v0.1.0', revision), { tag: 'v0.1.0', version: '0.1.0', revision, prerelease: true });
});

test('1.0.0 이상 안정 버전은 정식 release다', () => {
  assert.equal(releaseMetadata('v1.0.0', revision).prerelease, false);
  assert.equal(releaseMetadata('v12.34.56', revision).version, '12.34.56');
});

test('RC는 major와 무관하게 prerelease다', () => {
  assert.deepEqual(releaseMetadata('v1.0.0-rc.2', revision), { tag: 'v1.0.0-rc.2', version: '1.0.0-rc.2', revision, prerelease: true });
});

test('지원하지 않는 태그와 revision을 거부한다', () => {
  for (const tag of ['1.0.0', 'v01.0.0', 'v1.0.0-rc.', 'v1.0.0-beta.1', 'v1.0.0+build']) {
    assert.throws(() => releaseMetadata(tag, revision), /지원하지 않는 릴리스 태그/);
  }
  assert.throws(() => releaseMetadata('v1.0.0', 'ABC'), /Git revision/);
});

test('이미지 provenance label 불일치를 거부한다', () => {
  const labels = {
    'org.opencontainers.image.version': '0.1.0',
    'org.opencontainers.image.revision': revision,
    'org.opencontainers.image.source': 'https://github.com/PLS934/oss-scp',
  };
  assert.doesNotThrow(() => verifyReleaseLabels(labels, '0.1.0', revision));
  assert.throws(() => verifyReleaseLabels(labels, '0.2.0', revision), /version/);
  assert.throws(() => verifyReleaseLabels({}, '0.1.0', revision), /label 불일치/);
});
