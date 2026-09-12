## Why

#54의 선언형 기본 상세 renderer가 플러그인별 하드코딩 없이 섹션 구성과 필드 표시 정보를 사용하려면, 먼저 `plugin-v1`의 상세 화면 선언과 검증된 클라이언트 산출물 경계를 확정해야 한다. 현재 계약은 기본 목록만 정의하므로 상세 화면이 섹션 제목, 필드 순서와 object·array 표시 대상을 안전하게 결정할 수 없다.

## What Changes

- 각 데이터 종류의 `views.detail.sections`에 비어 있지 않은 상세 섹션 목록, 섹션 제목과 필드 순서를 선언한다.
- 상세 필드가 같은 데이터 종류의 최상위 필드만 참조하도록 검증하고, 존재하지 않는 필드, 섹션 간 중복 필드, 빈 섹션과 중복 섹션 제목을 배포 전 오류로 거부한다.
- scalar와 기존 `plugin-v1`이 지원하는 object·array 최상위 필드를 상세 화면 대상으로 허용한다.
- 검증된 상세 섹션과 선택된 필드의 `key`, `label`, `type`을 메뉴별 클라이언트 registry 산출물에 포함하되, 중첩 schema·원천 설정·Connection·가공 모듈 정보는 제외한다.
- sample1, sample2와 CSV 플러그인에 서로 다른 상세 섹션 구성을 추가하고 schema·loader·API/Web 경계 테스트와 플러그인 개발 문서를 갱신한다.
- 상세 React renderer, 관계 탐색, 큰 본문 다운로드, 사용자 정의 `Detail.tsx`와 권한 집행은 포함하지 않는다.

## Capabilities

### New Capabilities

- `plugin-detail-definition`: 데이터 종류별 기본 상세 섹션 선언, 필드 참조 검증과 최소 클라이언트 상세 정의 산출물 계약을 정의한다.

### Modified Capabilities

- `plugin-source-contract`: 모든 등록 플러그인의 데이터 종류가 유효한 기본 상세 선언을 제공하고 내부 정의에 포함하도록 최소 플러그인 계약을 확장한다.
- `plugin-menu-routing`: 검증된 메뉴 API 산출물이 목록 정의와 함께 상세 정의를 제공하고 클라이언트가 이를 안전하게 검증하도록 확장한다.

## Impact

- `packages/plugin-config`: `plugin-v1` JSON Schema, TypeScript 공개 타입, 교차 참조 검증과 클라이언트 registry 생성이 변경된다.
- `apps/api`, `apps/web`: `/api/v1/plugin-menus` 응답 타입·fixture와 브라우저 런타임 검증이 상세 정의를 포함하도록 확장된다. 기존 필드는 제거하거나 의미를 변경하지 않는다.
- `plugins/*`: 등록된 모든 기본 플러그인이 필수 상세 정의를 선언한다.
- `docs/plugin-development.md`와 관련 OpenSpec 계약·테스트가 갱신된다.
- 애플리케이션과 외부 플러그인 계약에 영향을 주므로 구현 단계에서 저장소 Docker CI의 빌드·기동·검증 경로를 실행한다.
