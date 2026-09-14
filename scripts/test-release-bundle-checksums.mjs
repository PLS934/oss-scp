import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildReleaseBundleChecksums } from './build-release-bundle-checksums.mjs';

test('외부 SHA256SUMS는 두 공개 번들만 파일명 순서로 검증한다', async () => {
  const output = mkdtempSync(join(tmpdir(), 'oss-scp-bundle-checksums-'));
  try {
    const version = '0.1.0';
    const files = new Map([
      [`oss-scp-bundle-${version}.tar.gz`, 'existing-db'],
      [`oss-scp-bundle-${version}-postgresql.tar.gz`, 'postgresql'],
    ]);
    for (const [name, content] of files) writeFileSync(join(output, name), content);
    writeFileSync(join(output, `oss-scp-api-${version}.tar.gz`), 'internal-only');

    await buildReleaseBundleChecksums(version, output);

    const expected = [...files]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, content]) => `${createHash('sha256').update(content).digest('hex')}  ${name}`)
      .join('\n');
    const checksum = readFileSync(join(output, 'SHA256SUMS'), 'utf8');
    assert.equal(checksum, `${expected}\n`);
    assert.doesNotMatch(checksum, /SHA256SUMS|oss-scp-api/);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('필수 번들이 없으면 checksum을 만들지 않고 실패한다', async () => {
  const output = mkdtempSync(join(tmpdir(), 'oss-scp-bundle-checksums-missing-'));
  try {
    await assert.rejects(buildReleaseBundleChecksums('0.1.0', output), /번들 파일이 없습니다/);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
