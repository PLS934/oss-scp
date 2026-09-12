## 1. 공개 상세 계약과 fixture

- [x] 1.1 상세 views의 필수·빈 값·지역 중복·추가 속성 실패 테스트를 먼저 추가하고 `plugin.schema.json`과 TypeScript 타입에 `views.detail.sections`, section과 전체 field type 기반 client 상세 타입을 구현하여 `pnpm --filter @oss-scp/plugin-config test`에서 schema 사례가 통과하는지 확인한다.
- [x] 1.2 sample1, sample2와 로컬·HTTP CSV `plugin.json`에 서로 다른 유효한 상세 섹션을 추가하고 `pnpm validate:plugins`로 모든 등록 플러그인이 새 필수 계약을 통과하는지 확인한다.

## 2. 참조 검증과 registry 생성

- [x] 2.1 존재하지 않는 상세 필드, 중복 섹션 제목과 섹션을 가로지르는 중복 필드의 두 번째 위치를 검증하는 실패 테스트를 추가한 뒤 loader 의미 검증을 구현하고 `pnpm --filter @oss-scp/plugin-config test`로 정확한 오류 path·message를 확인한다.
- [x] 2.2 scalar·object·array를 포함한 섹션 순서와 필드 key·label·type만 client registry에 생성되고 선택되지 않은 필드·중첩 schema·source·Connection·transform 정보가 제외되는 테스트를 추가한 뒤 상세 산출물 생성을 구현하여 `pnpm --filter @oss-scp/plugin-config test`로 확인한다.

## 3. API와 클라이언트 경계

- [x] 3.1 API 메뉴 응답 fixture와 계약 테스트를 상세 정의까지 확장하고 `pnpm --filter @oss-scp/api test`로 조회 범위·목록·상세 산출물이 함께 제공되며 서버 전용 정보가 노출되지 않는지 확인한다.
- [x] 3.2 웹 `MenuItem` 타입과 `/api/v1/plugin-menus` 런타임 guard의 유효·누락·잘못된 field type 테스트를 먼저 추가한 뒤 상세 정의 검증을 구현하고 `pnpm --filter @oss-scp/web test`와 `pnpm --filter @oss-scp/web typecheck`로 확인한다.

## 4. 문서와 전체 검증

- [x] 4.1 `docs/plugin-development.md`에 상세 sections 작성법, 허용 필드 타입, 중복·미존재 참조 오류와 최소 client 산출물 예시를 추가하고 문서 예제가 실제 JSON Schema 및 fixture와 일치하는지 대조한다.
- [x] 4.2 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:process:plugin-config`를 실행해 workspace 회귀를 확인한다.
- [x] 4.3 `.github/workflows/integration-ci.yaml`의 Docker 작업과 동일하게 `pnpm test:docker:workspace`, `pnpm test:docker:web`, `bash scripts/test-docker.sh`, `pnpm test:docker:external-db`, `pnpm test:docker:mysql`, `pnpm test:docker:mock`을 실행해 이미지 빌드·기동·외부 플러그인 설정 계약을 확인한다.
