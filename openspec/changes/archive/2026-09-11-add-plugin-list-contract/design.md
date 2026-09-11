## Context

현재 `packages/plugin-config`는 `plugin-v1`의 데이터 필드와 메뉴를 검증하고, API가 `/api/v1/plugin-menus`에서 `pluginId`, `sourceId`, `dataType`과 메뉴 표시 속성을 제공한다. 필드에는 타입과 필수 여부만 있고 목록 정의가 없어서 후속 renderer가 안전한 컬럼 key·제목·타입을 얻을 수 없다. 서버 플러그인은 외부 설정 루트에서 로드되므로 브라우저가 원본 manifest를 읽거나 다시 검증해서는 안 된다.

## Goals / Non-Goals

**Goals:**

- 한 데이터 종류가 자체 필드 정의와 기본 목록 순서를 함께 소유하게 한다.
- 구조 검증과 참조 검증을 분리해 오류 위치와 원인을 명확하게 제공한다.
- 기존 메뉴 API 경계를 확장해 renderer가 바로 소비할 수 있는 최소 목록 메타데이터를 제공한다.
- 모든 기본 샘플을 같은 계약으로 검증해 source 형식과 무관한 동작을 확인한다.

**Non-Goals:**

- 실제 표 renderer, 개인 컬럼 설정, 상세 화면과 중첩 필드 표시를 구현하지 않는다.
- object·array의 경로 문법이나 표시 형식을 미리 설계하지 않는다.
- 저장 레코드, 담당자 또는 원천 수집·가공 동작을 변경하지 않는다.

## Decisions

### 데이터 종류 안에 `views.list.columns`를 둔다

각 `data.types.<dataType>`에 `views.list.columns: string[]`를 둔다. 목록 정의를 플러그인 최상위에 두는 대안은 데이터 종류 key를 다시 매핑해야 하고, 단일 `menu.dataType` 아래에 두는 대안은 한 플러그인이 여러 데이터 종류와 후속 화면을 선언할 때 소유 관계가 불명확하다. 데이터 종류에 배치하면 필드와 참조 범위가 같은 객체에 있어 검증과 확장이 단순하다.

### 모든 필드의 `label`을 필수화한다

scalar뿐 아니라 object·array와 그 하위 필드에도 `label`을 요구한다. 이번 목록에는 최상위 scalar만 쓰지만, 필드 정의 계약 자체를 일관되게 유지하고 후속 상세·중첩 렌더링에서 표시명을 다시 추가하는 계약 변경을 피한다. 필드 key를 fallback label로 사용하는 대안은 누락된 운영자 의도를 숨기므로 사용하지 않는다.

### JSON Schema와 의미 검증의 책임을 나눈다

JSON Schema는 `label`의 문자열 제약과 `views.list.columns`의 최소 1개·문자열·중복 금지를 검사한다. loader의 의미 검증은 각 column이 같은 데이터 종류의 최상위 필드인지, 그리고 해당 필드가 scalar인지 검사한다. JSON Schema만으로 교차 참조를 표현하는 복잡한 조건식은 오류 품질과 유지보수성이 떨어지므로 사용하지 않는다.

### 기존 메뉴 런타임 산출물을 확장한다

별도 목록 registry endpoint를 만들지 않고 `ClientMenuItem`에 `list: { columns: ClientListColumn[] }`을 추가한다. 메뉴가 이미 하나의 `pluginId`·`sourceId`·`dataType` 조회 범위를 나타내므로 같은 응답에 해당 범위의 목록 정의를 결합하면 클라이언트가 두 응답의 revision을 맞출 필요가 없다. 산출 시 선언된 key로 필드를 찾아 `{ key, label, type }`만 복사하며 원본 field 객체나 runtime plugin 정의를 노출하지 않는다.

### 기존 `plugin-v1`을 엄격하게 갱신한다

새 apiVersion을 추가해 두 계약을 병행하는 대신 현재 개발 단계의 모든 기본 플러그인을 새 필수 계약으로 갱신한다. 이전 `plugin-v1`은 검증 실패하므로 호환성 영향은 있지만, 아직 공개 안정 버전이 아니고 fallback 규칙을 유지할 비용보다 명확한 단일 계약의 가치가 크다.

### 테스트 경계를 schema·loader·API·client로 나눈다

Schema 테스트는 label 누락, 빈 columns와 중복을 검증한다. loader 테스트는 누락 필드와 object·array 참조를 정확한 JSON path와 함께 거부하고 선언 순서대로 메타데이터를 생성하는지 확인한다. API와 웹의 메뉴 로더 테스트는 확장 응답이 전달되며 서버 전용 정보가 없는지 검증한다. 수집·가공·저장 결과는 계약에 영향이 없음을 기존 회귀 테스트로 확인한다.

## Risks / Trade-offs

- [기존 외부 `plugin-v1` 설정이 즉시 실패함] → 모든 저장소 샘플과 문서를 함께 갱신하고 검증 오류가 누락 위치를 가리키게 한다.
- [메뉴 응답 크기가 컬럼 수만큼 증가함] → 선택된 scalar 컬럼의 key·label·type만 포함하고 전체 필드 schema는 노출하지 않는다.
- [향후 한 데이터 종류에 여러 목록 view가 필요할 수 있음] → 현재는 `views.list` 하나만 정의하고 명확한 요구가 생길 때 이름 있는 view 계약을 별도 확장한다.
- [필드 label이 가공·저장 runtime 정의에도 포함됨] → label은 선언 메타데이터로만 취급하며 수집 레코드 검증과 저장 값에는 영향을 주지 않는다.

## Migration Plan

1. 모든 등록 플러그인의 각 필드에 `label`, 각 데이터 종류에 `views.list.columns`를 추가한다.
2. schema와 loader를 배포 전에 실행해 기존 manifest 누락과 잘못된 참조를 차단한다.
3. 확장된 메뉴 API와 이를 읽는 웹 클라이언트를 같은 플랫폼 릴리스로 배포한다.
4. 롤백 시 플랫폼 코드와 외부 플러그인 revision을 이전에 검증된 조합으로 함께 되돌린다. DB schema와 저장 레코드 migration은 없다.
