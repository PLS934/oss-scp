import { createHash } from 'node:crypto';
import { createReadStream, existsSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function buildReleaseBundleChecksums(version, output) {
  if (!version || !output) throw new Error('사용법: node scripts/build-release-bundle-checksums.mjs <version> <bundle-output>');
  const names = [
    `oss-scp-bundle-${version}.tar.gz`,
    `oss-scp-bundle-${version}-postgresql.tar.gz`,
  ].sort();
  const lines = [];
  for (const name of names) {
    const path = join(output, name);
    if (!existsSync(path)) throw new Error(`번들 파일이 없습니다: ${name}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    lines.push(`${hash.digest('hex')}  ${basename(name)}`);
  }
  writeFileSync(join(output, 'SHA256SUMS'), `${lines.join('\n')}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildReleaseBundleChecksums(process.argv[2], process.argv[3]);
}
