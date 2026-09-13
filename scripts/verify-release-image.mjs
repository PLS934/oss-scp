import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const source = 'https://github.com/PLS934/oss-scp';

export function verifyReleaseLabels(labels, version, revision) {
  const expected = {
    'org.opencontainers.image.version': version,
    'org.opencontainers.image.revision': revision,
    'org.opencontainers.image.source': source,
  };
  for (const [name, value] of Object.entries(expected)) {
    if (labels?.[name] !== value) throw new Error(`이미지 label 불일치: ${name}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const image = process.argv[2];
    const inspected = JSON.parse(execFileSync('docker', ['image', 'inspect', image], { encoding: 'utf8' }));
    verifyReleaseLabels(inspected[0]?.Config?.Labels, process.argv[3], process.argv[4]);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : '이미지 label 검사 실패'}\n`);
    process.exitCode = 1;
  }
}
