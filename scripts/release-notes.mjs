import { pathToFileURL } from 'node:url';

export function releaseNotes({ version, revision, apiDigest, webDigest }) {
  return `# oss-scp ${version}\n\n` +
    `- 제품 버전: \`${version}\`\n` +
    `- Git revision: \`${revision}\`\n` +
    `- API image digest: \`${apiDigest}\`\n` +
    `- Web image digest: \`${webDigest}\`\n` +
    '- 검증 환경: Ubuntu 24.04 linux/amd64, Docker Compose, PostgreSQL 17.6, MySQL 8.4.6\n\n' +
    '기존 DB(PostgreSQL 17.6 또는 MySQL 8.4.6)를 사용하면 기본 번들을, DB도 함께 설치하면 PostgreSQL 포함 번들을 선택하세요.\n\n' +
    'Release의 외부 `SHA256SUMS`는 내려받은 두 번들 archive를 검증합니다. 압축을 푼 뒤에는 번들 내부 `SHA256SUMS`로 구성 파일을 다시 검증하세요.\n\n' +
    'DB migration은 애플리케이션 기동 전에 문서의 명령으로 명시적으로 실행해야 합니다. 자동 down migration은 제공하지 않습니다.\n\n' +
    '0.x 릴리스는 기술 프리뷰이며 장기 호환성·유지보수를 보장하지 않습니다. 전체 지원 범위와 알려진 제한 사항은 `docs/development-workflow.md`를 확인하세요.\n';
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(releaseNotes({ version: process.argv[2], revision: process.argv[3], apiDigest: process.argv[4], webDigest: process.argv[5] }));
}
