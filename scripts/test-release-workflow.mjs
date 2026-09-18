import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { releaseNotes } from './release-notes.mjs';

test('통합 CI는 리뷰 후 수동 실행과 재사용 진입점 및 네 job을 유지한다', () => {
  const workflow = readFileSync('.github/workflows/integration-ci.yaml', 'utf8');
  for (const text of ['workflow_call:', 'push:', 'workflow_dispatch:', 'dispatch-guard:', 'mysql:', 'postgres:', 'local:', 'docker:']) assert.match(workflow, new RegExp(`\\b${text.replace(':', '')}:`));
  assert.doesNotMatch(workflow, /\bpull_request:/);
  assert.match(workflow, /pr_number:[\s\S]*expected_sha:/);
  assert.match(workflow, /actual_sha[\s\S]*EXPECTED_SHA/);
  assert.match(workflow, /ref: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.expected_sha \|\| github\.sha \}\}/);
  assert.match(workflow, /pnpm test:docker:release/);
});

test('릴리스 workflow는 검증 뒤 최소 권한으로 불변 draft를 공개한다', () => {
  const workflow = readFileSync('.github/workflows/release.yaml', 'utf8');
  assert.match(workflow, /tags:\s*\n\s*- ['"]v\*['"]/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/integration-ci\.yaml/);
  assert.match(workflow, /permissions:\s*\n\s*contents: write/);
  assert.match(workflow, /gh release view/);
  assert.match(workflow, /--draft/);
  assert.match(workflow, /--draft=false/);
  assert.match(workflow, /build-offline-bundles\.sh/);
  assert.match(workflow, /verify-offline-bundles\.mjs/);
  assert.match(workflow, /test-offline-bundle-generator\.sh/);
  assert.match(workflow, /build-release-bundle-checksums\.mjs/);
  assert.match(workflow, /oss-scp-bundle-.*\.tar\.gz/);
  assert.match(workflow, /oss-scp-bundle-.*-postgresql\.tar\.gz/);
  const upload = workflow.match(/gh release create "\$RELEASE_TAG" \\\n(?<assets>[\s\S]*?)\s+--verify-tag/)?.groups?.assets;
  assert.ok(upload, 'GitHub Release 업로드 자산 목록을 찾을 수 있어야 한다');
  const paths = [...upload.matchAll(/^\s+([^\s\\]+) \\$/gm)].map(([, path]) => path);
  assert.deepEqual(paths, [
    'bundle-output/oss-scp-bundle-"$RELEASE_VERSION".tar.gz',
    'bundle-output/oss-scp-bundle-"$RELEASE_VERSION"-postgresql.tar.gz',
    'bundle-output/SHA256SUMS',
  ]);
  for (const forbidden of ['release-output/oss-scp-api-', 'release-output/oss-scp-web-', '-compose.yaml', '.env.example', 'release-output/SHA256SUMS']) {
    assert.doesNotMatch(upload, new RegExp(forbidden.replaceAll('.', '\\.')));
  }
  assert.doesNotMatch(workflow, /packages: write|pull-requests: write/);
});

test('릴리스 본문은 번들 선택, checksum 경계, provenance와 제한 사항을 포함한다', () => {
  const notes = releaseNotes({ version: '0.1.0', revision: 'a'.repeat(40), apiDigest: 'sha256:api', webDigest: 'sha256:web' });
  for (const value of ['0.1.0', 'a'.repeat(40), 'sha256:api', 'sha256:web', 'Ubuntu 24.04', 'migration', '기술 프리뷰', '기존 DB', 'PostgreSQL 포함', '외부 `SHA256SUMS`', '내부 `SHA256SUMS`']) assert.match(notes, new RegExp(value));
});
