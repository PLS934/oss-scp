import { pathToFileURL } from 'node:url';
import { appendFileSync } from 'node:fs';

const tagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/;
const revisionPattern = /^[0-9a-f]{40}$/;

export function releaseMetadata(tag, revision) {
  const match = tagPattern.exec(tag);
  if (!match) throw new Error(`지원하지 않는 릴리스 태그입니다: ${tag}`);
  if (!revisionPattern.test(revision)) throw new Error('Git revision은 40자리 소문자 16진수여야 합니다.');
  const [, major, minor, patch, rc] = match;
  return {
    tag,
    version: `${major}.${minor}.${patch}${rc === undefined ? '' : `-rc.${rc}`}`,
    revision,
    prerelease: major === '0' || rc !== undefined,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const metadata = releaseMetadata(process.argv[2] ?? '', process.argv[3] ?? '');
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `tag=${metadata.tag}\nversion=${metadata.version}\nrevision=${metadata.revision}\nprerelease=${metadata.prerelease}\n`);
    }
    process.stdout.write(`${JSON.stringify(metadata)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : '릴리스 메타데이터 생성 실패'}\n`);
    process.exitCode = 1;
  }
}
