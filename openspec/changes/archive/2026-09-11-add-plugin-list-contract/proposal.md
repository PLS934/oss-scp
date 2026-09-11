## Why

후속 선언형 기본 목록 renderer가 플러그인별 하드코딩 없이 컬럼을 구성하려면, 운영자가 작성하는 필드 표시명과 기본 컬럼 선언을 배포 전에 검증하고 안전한 런타임 API로 제공해야 한다. 현재 플러그인 계약에는 필드 `label`과 목록 정의가 없으므로 클라이언트가 표시할 컬럼의 key·제목·타입을 신뢰할 수 없다.

## What Changes

- 모든 플러그인 데이터 필드에 사람이 읽을 수 있는 `label`을 필수로 선언한다.
- 각 데이터 종류에 `views.list.columns`로 비어 있지 않은 기본 목록 컬럼 순서를 선언한다.
- 목록 컬럼이 같은 데이터 종류의 최상위 scalar 필드만 참조하도록 검증하고, 누락 필드·중복 컬럼·object·array 참조를 배포 전 오류로 거부한다.
- 검증된 메뉴 런타임 API 응답에 `list.columns`를 `{ key, label, type }` 형태로 포함한다.
- 클라이언트 산출물에서 원천 설정, Connection 정보, 가공 모듈 경로와 목록에 필요하지 않은 필드 정의를 제외한다.
- sample1, sample2와 CSV 샘플 플러그인에 같은 계약을 적용해 source 형식과 데이터 구조가 달라도 코어 변경 없이 재사용되는지 검증한다.
- schema·loader·런타임 API 테스트와 플러그인 개발 문서를 갱신한다.
- 개인 컬럼 선택·순서·너비, 중첩 object·array 렌더링, 상세 화면 정의, 사용자 정의 React 화면은 제외한다.

## Capabilities

### New Capabilities

- `plugin-list-definition`: 데이터 종류별 기본 목록 컬럼 선언, 참조 검증과 안전한 클라이언트 목록 산출물 계약

### Modified Capabilities

- `plugin-source-contract`: 플러그인 필드의 필수 표시명과 데이터 종류별 기본 목록 선언을 최소 manifest 계약에 추가한다.
- `plugin-menu-routing`: 검증된 메뉴 API 항목이 해당 조회 범위의 기본 목록 컬럼 메타데이터도 제공하도록 확장한다.

## Impact

- `packages/plugin-config`: TypeScript manifest·클라이언트 타입, `plugin-v1` JSON Schema, 교차 참조 검증과 메뉴 산출물 생성이 변경된다.
- `plugins/*/plugin.json`: 등록된 모든 샘플의 필드 표시명과 기본 목록 컬럼 선언이 추가된다.
- `apps/api`: `/api/v1/plugin-menus` 응답 타입과 비민감 정보 경계 테스트가 확장된다.
- `apps/web`: 메뉴 응답을 읽는 클라이언트 타입·검증 테스트가 새 목록 메타데이터를 보존하도록 변경되지만 목록 renderer는 추가하지 않는다.
- `docs/plugin-development.md`와 관련 OpenSpec 계약이 갱신된다.
- 모든 등록 플러그인에 새 필수 필드가 생기므로 기존 `plugin-v1` 선언은 갱신 전까지 검증에 실패하는 호환성 영향이 있다.
