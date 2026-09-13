import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBundleManifest } from './bundle-manifest.mjs';

const [version, revision, output] = process.argv.slice(2);
if (!version || !revision || !output) {
  console.error('사용법: node scripts/verify-offline-bundles.mjs <version> <revision> <output-directory>');
  process.exit(2);
}

const temporary = mkdtempSync(join(tmpdir(), 'oss-scp-bundle-verify-'));
const requiredFiles = ['README.md', 'SHA256SUMS', 'compose.yaml', 'env.example', 'images.tar', 'install.sh', 'lib.sh', 'manifest.json', 'rollback.sh', 'update.sh', 'verify.sh'];
try {
  for (const variant of ['existing-db', 'postgresql']) {
    const suffix = variant === 'postgresql' ? '-postgresql' : '';
    const root = `oss-scp-bundle-${version}${suffix}`;
    const archive = join(output, `${root}.tar.gz`);
    execFileSync('tar', ['-xzf', archive, '-C', temporary]);
    const directory = join(temporary, root);
    const actualFiles = execFileSync('find', ['.', '-maxdepth', '1', '-type', 'f', '-print'], { cwd: directory, encoding: 'utf8' })
      .trim().split('\n').map(value => value.replace(/^\.\//, '')).sort();
    assert.deepEqual(actualFiles, requiredFiles, `${root} 내부 파일 목록`);
    execFileSync('sha256sum', ['--check', '--strict', 'SHA256SUMS'], { cwd: directory, stdio: 'pipe' });
    for (const script of ['install.sh', 'rollback.sh', 'update.sh', 'verify.sh']) assert.ok(statSync(join(directory, script)).mode & 0o100, `${script} 실행 권한`);

    const manifest = readBundleManifest(readFileSync(join(directory, 'manifest.json'), 'utf8'));
    assert.equal(manifest.productVersion, version);
    assert.equal(manifest.gitRevision, revision);
    assert.equal(manifest.variant, variant);

    const imageManifest = JSON.parse(execFileSync('tar', ['-xOf', join(directory, 'images.tar'), 'manifest.json'], { encoding: 'utf8' }));
    const tags = imageManifest.flatMap(image => image.RepoTags ?? []).sort();
    const expected = [`oss-scp-api:${version}`, `oss-scp-web:${version}`];
    if (variant === 'postgresql') expected.push('postgres:17.6-bookworm');
    assert.deepEqual(tags, expected.sort(), `${root} 이미지 목록`);
    const configDigests = new Set(imageManifest.map(image => `sha256:${image.Config.split('/').at(-1)}`));
    for (const image of manifest.images) assert.ok(configDigests.has(image.digest), `${image.name} digest가 images.tar에 있어야 합니다`);
  }
  console.log('두 폐쇄망 번들의 파일·checksum·manifest·이미지 목록: 통과');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
