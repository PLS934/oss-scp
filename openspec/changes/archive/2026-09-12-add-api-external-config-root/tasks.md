## 1. Runtime registry

- [x] 1.1 API에 `PluginRuntimeRegistry` interface·injection token·생성 함수를 추가하고 preflight 성공 결과를 `structuredClone` 후 재귀 동결하며, 생성 입력과 반환값의 변경 시도에도 registry 상태가 유지되는 단위 테스트로 검증한다.
- [x] 1.2 Registry가 전체 수집 정의, 정렬된 메뉴, plugin ID별 단일 정의 또는 `undefined`를 제공하도록 구현하고 순서·ID 조회·미등록 ID 동작을 단위 테스트로 검증한다.

## 2. API 통합

- [x] 2.1 `AppModule.register`가 메뉴 배열 대신 생성된 registry를 받아 동일 인스턴스를 provider로 등록하도록 전환하고 NestJS 테스트 소비자들이 같은 인스턴스를 주입받는지 검증한다.
- [x] 2.2 `PluginMenuController`가 기존 `PLUGIN_MENUS` token 대신 registry를 사용하도록 전환하고 기존 메뉴 응답 payload와 정렬 회귀 테스트가 통과하는지 검증한다.

## 3. 안전한 기동과 snapshot 수명

- [x] 3.1 `ConfigurationIssue[]`의 상대 파일·필드 경로·일반화한 메시지만 직렬화하는 기동 오류 formatter를 구현하고, 복수 오류가 모두 보이면서 설정 루트 절대 경로·비밀값·원본 예외·stack·C0/C1 제어문자는 노출되지 않는 단위 테스트로 검증한다.
- [x] 3.2 Bootstrap이 preflight 성공 직후 registry를 한 번만 생성하고 실패 시 안전한 상세 오류를 출력한 뒤 DB 연결과 listen 전에 종료하도록 연결하며, 유효한 설정의 정상 기동과 복수 오류 설정의 비정상 종료·비수신 상태를 프로세스 테스트로 검증한다.
- [x] 3.3 임시 외부 설정으로 API를 시작한 뒤 메뉴 파일을 변경해도 기존 프로세스 응답이 유지되고, 재기동 및 전체 검증 성공 후에만 변경값이 반영되는 프로세스 회귀 테스트를 추가한다.

## 4. 문서와 전체 검증

- [x] 4.1 `docs/server-development.md`에 기동 시 snapshot 고정, hot reload 미지원, 설정 변경 시 재기동·전체 검증 절차를 반영하고 문서의 명령과 예제가 실제 인터페이스와 일치하는지 확인한다.
- [x] 4.2 `openspec validate add-api-external-config-root --strict`와 프로젝트의 typecheck·lint·test·build 및 관련 process test를 실행해 로컬 검증이 모두 통과하는지 확인한다.
- [x] 4.3 `.github/workflows/integration-ci.yaml` 기준으로 `pnpm test:docker:workspace`, `pnpm test:docker:web`, `bash scripts/test-docker.sh`, `pnpm test:docker:mock`을 실행해 Docker CI 경로를 검증한다.
- [x] 4.4 최종 diff를 GitHub 이슈 #69의 수정 범위와 대조해 runtime 재읽기·custom fetch·Compose·DB·클라이언트 변경이 포함되지 않았고 모든 요구사항에 구현 또는 테스트가 대응하는지 확인한다.
