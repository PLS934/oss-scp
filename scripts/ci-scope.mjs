import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const full = () => ({ code: true, bundle: true, mock: true });
const workspaces = /^(?:apps\/(?:api|web|collector-cli|mock-api)|packages\/(?:collection-engine|csv-reader|http-collector|http-csv-source|local-csv-source|platform-db|plugin-config|plugin-sdk))\//;

export function classifyFiles(files) {
  // 빈 diff도 변경 감지 누락 가능성을 고려해 전체 검증한다.
  if (files.length === 0) return full();
  const scope = { code: false, bundle: false, mock: false };
  for (const file of files) {
    // release/bundle/README.md는 배포 자산이므로 문서 제외 대상이 아니다.
    if (/^(?:README\.md|docs\/.*\.md|openspec\/.*\.(?:md|ya?ml)|\.github\/(?:ISSUE_TEMPLATE\/.*\.md|pull_request_template\.md))$/.test(file)) continue;
    scope.code = true;
    // 알려진 workspace의 테스트만 변경한 경우 이미지 설치·복구는 반복하지 않는다.
    const relative = file.replace(workspaces, '');
    if (relative !== file && /^(?:test\/|vitest\.config\.[cm]?[jt]s$)/.test(relative)) continue;
    if (file.startsWith('apps/mock-api/')) {
      scope.mock = true;
      continue;
    }
    if (file.startsWith('release/') || /^scripts\/(?:(?:build|verify|test)-(?:release|offline-bundle)[\w.-]*|bundle-manifest(?:\.test)?\.mjs|release-(?:metadata(?:\.test)?|notes)\.mjs|test-bundle-contract\.mjs)$/.test(file)) {
      scope.bundle = true;
      continue;
    }
    // 런타임·공통 패키지·lockfile·CI·미분류 파일은 보수적으로 모두 검증한다.
    return full();
  }
  return scope;
}

export function detectScope({ eventName, event, forceFull = false, git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }) }) {
  if (forceFull || !['pull_request', 'push'].includes(eventName) || event.ref?.startsWith('refs/tags/')) {
    return { ...full(), reason: '릴리스·재사용·수동 전체 검증' };
  }
  const base = eventName === 'pull_request' ? event.pull_request?.base?.sha : event.before;
  const head = eventName === 'pull_request' ? event.pull_request?.head?.sha : event.after;
  if (![base, head].every(sha => typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha) && !/^0+$/.test(sha))) {
    return { ...full(), reason: '비교 commit이 없어 전체 검증' };
  }
  try {
    // rename을 삭제+추가로 처리해 이전 경로의 영향도 보존한다. NUL로 특수 파일명을 구분한다.
    const range = `${base}${eventName === 'pull_request' ? '...' : '..'}${head}`;
    const files = git(['diff', '--name-only', '--no-renames', '-z', range, '--']).split('\0').filter(Boolean);
    return { ...classifyFiles(files), reason: `${files.length}개 변경 파일 기준` };
  } catch {
    return { ...full(), reason: 'commit 비교 실패로 전체 검증' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = detectScope({
    eventName: process.env.GITHUB_EVENT_NAME,
    event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
    forceFull: process.env.CI_FULL === 'true',
  });
  console.log(JSON.stringify(scope));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, ['code', 'bundle', 'mock'].map(key => `${key}=${scope[key]}\n`).join(''));
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## CI 실행 범위\n\n${scope.reason}\n\n| 코드 검증 | 릴리스·번들 Docker | mock Docker |\n| --- | --- | --- |\n| ${scope.code} | ${scope.bundle} | ${scope.mock} |\n`);
  }
}
