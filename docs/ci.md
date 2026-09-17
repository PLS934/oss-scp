# CI 실행 범위

통합 검증은 PR, main push, 수동 실행과 릴리스 workflow의 재사용 호출에서 시작한다. workflow 자체에는 경로 필터를 두지 않는다. `변경 범위 확인` job이 변경 파일을 분류하고 기존 네 검사 job의 이름을 유지한다.

## 변경별 실행 정책

| 변경 내용 | 로컬·DB 통합·기본 Docker | 릴리스·번들 Docker | mock Docker |
| --- | --- | --- | --- |
| 루트 README, docs의 Markdown, OpenSpec의 Markdown/YAML, 이슈·PR 템플릿만 변경 | 생략 | 생략 | 생략 |
| 기존 앱·공통 패키지의 test 디렉터리 또는 Vitest 설정만 변경 | 실행 | 생략 | 생략 |
| mock 앱만 변경 | 실행 | 생략 | 실행 |
| release 디렉터리 및 명시된 릴리스·번들 스크립트만 변경 | 실행 | 실행 | 생략 |
| API·웹·CLI 실행 코드, 공통 패키지, migration, 플러그인, 연결 설정, fixture | 실행 | 실행 | 실행 |
| 루트 package.json, lockfile, workspace 설정, 공통 Docker/Compose 설정, CI, 미분류 파일 | 실행 | 실행 | 실행 |
| 태그 릴리스, 수동 실행, 기본 재사용 호출 | 실행 | 실행 | 실행 |

여러 종류가 섞이면 필요한 검증의 합집합을 실행한다. 알려진 경로 외의 파일은 전체 검증한다. 예를 들어 `docs/setup.sh`는 문서 전용 변경으로 취급하지 않는다. `release/bundle/README.md`는 설치 번들에 포함되는 배포 자산이므로 릴리스·번들 검증 대상이다.

`로컬·DB 통합·기본 Docker`에는 workspace 테스트, 빌드·타입 검사·lint, 프로세스·브라우저 검사, PostgreSQL/MySQL 수집·검색 통합, workspace·웹·API·외부 DB Docker 검증이 포함된다. mock Docker 검사도 API·웹과 연계하므로 앱 런타임 변경 시에는 유지한다.

중복 실행하던 HTTP collector·HTTP CSV·CLI 및 platform-db 전체 패키지 테스트는 local job의 `pnpm test`에서 한 번만 실행한다. 이 명령에는 PostgreSQL과 MySQL 어댑터 테스트가 모두 포함된다. 별도의 DB별 수집·조회·브라우저 통합 검사는 유지한다.

## 변경 감지와 필수 체크

- PR은 base와 head의 merge-base부터 head까지 비교해 PR 전체 변경을 검사한다. 최신 커밋이 문서 수정이어도 이전 코드 변경을 놓치지 않는다.
- main push는 이벤트의 before와 after를 비교한다.
- 전체 이력을 checkout하고 Git diff를 사용하므로 GitHub 경로 필터의 파일 수 제한에 의존하지 않는다.
- rename은 삭제와 추가로 처리해 이전 경로와 새 경로 양쪽의 영향을 포함한다.
- 비교 commit 누락, 최초 push, diff 실패 또는 빈 diff는 전체 검증으로 처리한다.
- 변경 감지 job 자체가 실패하면 기존 네 검사도 실패한다. 오류를 성공 또는 생략으로 숨기지 않는다.
- 문서 전용 변경의 네 job은 job 조건으로 생략되어 필수 상태 검사를 대기 상태로 남기지 않는다. workflow 수준의 `paths-ignore`를 사용하지 않는다.
- 재사용 workflow는 `full` 입력의 기본값이 `true`이며 릴리스 workflow에서도 명시적으로 전달한다. 수동 실행은 항상 전체 검증한다.

판정 결과는 Actions 실행 요약에 기록한다. 정책은 `scripts/ci-scope.mjs`, 회귀 검증은 `scripts/ci-scope.test.mjs`에서 관리한다. 변경 감지 job은 외부 패키지 설치 없이 Node.js로 회귀 검증을 실행한다.

필수 체크의 생략과 의존 job 처리 방식은 [GitHub Actions workflow 문법](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)과 [필수 상태 검사 문제 해결](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/troubleshooting-required-status-checks)을 따른다.

## 기준 실행과 측정

[2026-09-15 main 실행](https://github.com/PLS934/oss-scp/actions/runs/34921562601)의 job 실행 시간은 다음과 같다. 전체 경과 시간에는 runner 대기도 포함되므로 job 시간과 구분한다.

| 항목 | 개선 전 실측 |
| --- | --- |
| 로컬 개발 및 배포 빌드 | 6분 21초 |
| PostgreSQL | 3분 1초 |
| MySQL | 3분 1초 |
| Docker 빌드 및 실행 | 14분 34초 |
| 그중 오프라인 번들 | 5분 44초 |
| 그중 mock Docker | 1분 45초 |

문서 전용 변경은 변경 감지 job만 실행하고, 테스트 전용 변경은 릴리스·번들·mock Docker 세 단계를 생략한다. 런타임 변경은 전체 검증을 유지하므로 Docker 병목 자체가 없어지는 변경은 아니다. 실제 개선 후 실행 시간은 PR의 Actions 결과와 비교해 기록하며, 위 시간의 단순 차감을 개선 실측으로 표시하지 않는다.
