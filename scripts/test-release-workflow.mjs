import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { releaseNotes } from './release-notes.mjs';

test('통합 CI는 기존 trigger와 재사용 진입점 및 네 job을 유지한다', () => {
  const workflow = readFileSync('.github/workflows/integration-ci.yaml', 'utf8');
  for (const text of ['workflow_call:', 'push:', 'pull_request:', 'workflow_dispatch:', 'mysql:', 'postgres:', 'local:', 'docker:']) assert.match(workflow, new RegExp(`\\b${text.replace(':', '')}:`));
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
  assert.doesNotMatch(workflow, /packages: write|pull-requests: write/);
});

test('릴리스 본문은 배포 provenance와 제한 사항을 포함한다', () => {
  const notes = releaseNotes({ version: '0.1.0', revision: 'a'.repeat(40), apiDigest: 'sha256:api', webDigest: 'sha256:web' });
  for (const value of ['0.1.0', 'a'.repeat(40), 'sha256:api', 'sha256:web', 'Ubuntu 24.04', 'migration', '기술 프리뷰']) assert.match(notes, new RegExp(value));
});
