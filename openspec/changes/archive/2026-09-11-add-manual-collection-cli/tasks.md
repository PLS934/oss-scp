## 1. CLI 기반과 선택 계약

- [x] 1.1 `apps/collector-cli` workspace app, TypeScript build 및 `collect <plugin-id>` 인자 parser를 추가하고 필수 ID·추가 인자·미지원 옵션의 종료 코드 1 회귀 테스트를 통과시킨다.
- [x] 1.2 repository 전체 검증과 정확한 plugin ID 단일 선택을 구현하고 등록 대상 성공, 미등록·비활성·중복 및 설정 오류에서 runner·DB가 호출되지 않는 단위 테스트를 통과시킨다.
- [x] 1.3 선택된 비밀 제외 설정을 정규화해 안정적인 config revision과 full scope/source ID를 생성하고 동일 설정의 결정성 및 설정 변경 감지 테스트를 통과시킨다.

## 2. 수집·저장 조립

- [x] 2.1 기존 HTTP offset·single 및 local CSV 구현을 collection runner의 collector 계약으로 변환하는 adapter registry를 추가하고 각 source가 checkpoint·AbortSignal·묶음 metadata를 보존하는 테스트를 통과시킨다.
- [x] 2.2 기존 플랫폼 DB 환경·password file 설정을 읽어 PostgreSQL 연결과 `RecordStorage`를 만드는 storage provider registry를 추가하고 미등록 DB 및 RecordStorage 미지원 MySQL이 runner 호출 전에 안전한 설정 오류가 되는 테스트를 통과시킨다.
- [x] 2.3 검증된 definition, collector, storage와 scope로 기존 runner를 정확히 한 번 호출하는 조립 코어를 구현하고 가짜 runner·adapter 기반 성공·부분 성공·설정 실패·실행 실패 테스트를 통과시킨다.

## 3. 프로세스 결과와 안전성

- [x] 3.1 성공 0, 설정·사용법 실패 1, 부분 성공 2, 실행 실패 3, 취소 130의 결과 mapper와 허용 목록 JSON Lines logger를 구현하고 출력 schema 및 집계 필드 테스트를 통과시킨다.
- [x] 3.2 하위 설정·collector·DB driver 오류에 password, token, authorization, connection string, 원천 응답 및 stack을 주입한 회귀 테스트를 추가하고 stdout/stderr 어디에도 값이 노출되지 않음을 검증한다.
- [x] 3.3 SIGINT·SIGTERM을 공통 AbortSignal로 전달하고 idempotent cleanup stack으로 모든 종료 경로의 자원을 역순 정리하며 반복 close와 원래 오류 보존 테스트를 통과시킨다.
- [x] 3.4 실제 child process에서 가짜 dependency entrypoint를 실행해 각 종료 코드, JSON 한 줄 결과, runner 단일 호출 및 signal 취소를 검증하는 프로세스 테스트를 통과시킨다.

## 4. 실행·배포 통합

- [x] 4.1 루트 `pnpm collect -- <plugin-id>` 명령과 필요한 workspace 의존성·lockfile을 연결하고 clean install 뒤 CLI build·typecheck·lint·test를 통과시킨다.
- [x] 4.2 API Dockerfile에 동일 CLI runtime과 등록된 JSON·빌드된 transform artifact를 포함하되 API 기본 CMD를 유지하고 TypeScript 원본·테스트·비밀 파일 미포함 검사와 이미지 내부 CLI 프로세스 테스트를 통과시킨다.
- [x] 4.3 CI에 CLI 단위·프로세스·이미지 회귀 검증을 연결하고 전체 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` 및 관련 Docker 테스트를 통과시킨다.

## 5. 운영 문서와 명세 검증

- [x] 5.1 플러그인 선택, registry 전체 검증, 플랫폼 DB 환경변수·password file/secret 취급, 로컬·배포 이미지 명령, JSON 로그와 종료 코드 및 현재 MySQL 저장 미지원 범위를 문서화하고 문서의 명령 예제를 프로세스 테스트와 대조한다.
- [x] 5.2 이슈 49 완료 조건과 구현 결과를 대조하고 `openspec validate add-manual-collection-cli --strict` 및 전체 회귀 검증을 통과시킨 뒤 작업 체크리스트를 갱신한다.
