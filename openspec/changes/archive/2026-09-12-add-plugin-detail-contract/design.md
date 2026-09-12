## Context

현재 `plugin-v1`은 각 데이터 종류의 `views.list.columns`와 모든 필드의 `label`을 요구한다. `packages/plugin-config`는 JSON Schema 구조 검증 후 목록 필드 참조를 의미 검증하고, 메뉴 대상 data type의 검증된 목록 메타데이터를 `ClientMenuItem`으로 생성한다. API는 이를 `/api/v1/plugin-menus`에서 그대로 제공하며 웹은 응답을 런타임 검증한다. 상세 레코드 조회 API는 이미 있지만, 상세 renderer가 사용할 섹션 계약은 없다.

이 변경은 공개 플러그인 schema, 서버 산출물과 브라우저 타입에 걸치므로 기존 목록 계약과 동일한 단일 검증 경계를 확장해야 한다. 동작 요구사항은 `specs/plugin-detail-definition/spec.md`와 수정 delta를 따른다.

## Goals / Non-Goals

**Goals:**

- 목록과 동일하게 data type의 `views` 아래에서 상세 화면 순서와 표시 대상을 선언한다.
- 구조 검증과 교차 참조 검증을 분리해 구체적인 JSON 경로의 오류를 제공한다.
- 서버가 검증한 최소 상세 메타데이터만 브라우저로 전달한다.
- 기존 source 형식과 무관하게 모든 등록 플러그인이 동일한 상세 계약을 사용하게 한다.

**Non-Goals:**

- 상세 React renderer나 상세 URL/조회 API 동작을 변경하지 않는다.
- 중첩 object 속성별 layout, 관계 링크, 큰 본문 다운로드와 사용자 정의 화면 계약을 만들지 않는다.
- 필드 누락 여부를 권한으로 해석하거나 권한 집행을 추가하지 않는다.

## Decisions

### 상세 선언을 data type의 `views.detail.sections`에 둔다

공개 형식은 다음 구조를 사용한다.

```json
{
  "views": {
    "list": { "columns": ["id", "title"] },
    "detail": {
      "sections": [
        { "title": "기본 정보", "fields": ["id", "title"] }
      ]
    }
  }
}
```

메뉴 아래에 상세 정의를 두는 대안은 같은 data type을 표시하는 화면 정의와 데이터 정의가 분리되고 기존 목록 계약과 비대칭이 된다. 필드마다 section 이름을 붙이는 대안은 순서와 빈 섹션을 표현하기 어렵다. 따라서 기존 `views.list`의 형제인 `views.detail`을 필수로 추가한다.

### JSON Schema는 형태와 지역 중복을, loader는 교차 참조와 전역 중복을 검증한다

Schema는 `sections`와 각 `fields`의 `minItems: 1`, 필드 배열의 `uniqueItems: true`, 제목 길이와 `additionalProperties: false`를 검사한다. 섹션 제목 중복과 여러 섹션을 가로지르는 필드 중복은 JSON Schema만으로 정확한 두 번째 위치를 보고하기 어려우므로 loader가 data type별 `Set`으로 검사한다. 존재하지 않는 필드도 현재 목록 검증처럼 loader가 `/data/types/{type}/views/detail/sections/{sectionIndex}/fields/{fieldIndex}` 경로에 오류를 추가한다.

중복을 첫 선언이 아니라 두 번째 선언 위치에서 보고하면 운영자가 수정할 위치가 명확하다. 하나라도 상세 오류가 있으면 해당 플러그인의 수집 정의와 메뉴 산출물을 모두 승인하지 않는 현재 원자적 검증 정책을 유지한다.

### 상세 필드는 최상위 필드만 참조하고 모든 공개 필드 타입을 허용한다

필드 참조는 점 경로나 별도 selector가 아닌 `fields` 객체의 key다. scalar만 허용하는 목록과 달리 상세는 `string`, `number`, `boolean`, `datetime`, `object`, `array`를 모두 허용한다. object·array의 내부 구조는 기존 `FieldDefinition`이 schema에서 검증하지만 클라이언트 registry에는 전달하지 않는다. 후속 renderer는 레코드의 해당 값을 `type`에 따라 일반 JSON 표현으로 처리할 수 있다.

중첩 경로를 허용하는 대안은 path escaping, 배열 요소 선택과 label 결정 규칙을 새로 요구하므로 현재 범위에서 제외한다. 모든 선언 필드를 반드시 한 번 포함시키는 대안도 운영자의 표시 대상 선택을 막으므로 채택하지 않는다.

### `ClientMenuItem`에 최소 `detail` 산출물을 추가한다

공개 타입은 `ClientDetailField { key, label, type }`, `ClientDetailSection { title, fields }`, `ClientDetailDefinition { sections }`를 추가하고 `ClientMenuItem.detail`을 필수로 둔다. `type`은 scalar뿐 아니라 `object | array`를 포함한 공개 최상위 field type이다.

loader는 data type별 목록과 상세 client definition을 함께 만든 후 메뉴가 가리키는 data type의 두 정의만 산출물에 결합한다. 이로써 다른 data type이나 선택되지 않은 필드의 schema가 API에 노출되지 않는다. 별도 `/plugin-details` endpoint는 메뉴 route context와 중복되고 클라이언트가 두 응답의 revision 일관성을 맞춰야 하므로 만들지 않는다.

웹의 런타임 guard도 동일한 최소 구조, 허용 타입, 비어 있지 않은 배열과 문자열을 검사한다. 서버가 상세 필드 중복을 이미 검증하므로 브라우저 guard는 신뢰 경계에서 구조·타입만 확인하고 원시 플러그인 의미 검증을 반복하지 않는다.

### 기존 플러그인을 한 번에 새 필수 계약으로 전환한다

아직 1.0 이전의 `plugin-v1` 개발 단계이고 이슈가 모든 기본 플러그인의 새 계약 통과를 요구하므로 `detail`을 선택 속성으로 두는 호환 기간은 만들지 않는다. sample1은 scalar 중심, sample2는 object·array가 포함된 서로 다른 섹션 구성으로 만들고 CSV 플러그인도 업무 필드에 맞는 상세 정의를 제공한다.

선택 속성에 기본 섹션을 자동 생성하는 대안은 운영자가 승인하지 않은 필드를 노출하고 플러그인별 표시 의도를 잃으므로 채택하지 않는다.

## Risks / Trade-offs

- [Risk] `plugin-v1`을 사용하는 외부 플러그인은 새 필수 `detail` 없이 검증에 실패한다. → 개발 문서에 migration 예시를 제공하고 오류 경로가 누락 위치를 직접 가리키게 한다.
- [Risk] object·array에 `type`만 전달하면 후속 renderer의 중첩 layout 표현력이 제한된다. → 이번 범위는 안전한 일반 표현으로 제한하고 중첩 schema 기반 layout은 별도 계약 변경으로 다룬다.
- [Risk] 목록과 상세 client definition 생성 로직이 loader loop를 복잡하게 만들 수 있다. → data type별 산출물 생성을 작은 helper로 분리하되 새로운 registry 계층은 만들지 않는다.
- [Risk] API 응답을 엄격히 검증하는 기존 웹이 서버·클라이언트 혼합 배포에서 새 필드 누락을 거부한다. → 이 저장소의 웹·API는 같은 제품 버전으로 배포하며, Docker 통합 검증으로 결합을 확인한다.

## Migration Plan

1. schema와 타입을 확장하고 모든 저장소 기본 플러그인에 상세 정의를 추가한다.
2. loader 검증과 client 산출물 생성, API/Web fixture 및 guard를 같은 변경으로 배포한다.
3. 패키지 단위 테스트·타입 검사 후 `.github/workflows/integration-ci.yaml`의 Docker 빌드·기동·설정 검증 경로를 실행한다.
4. 롤백 시 코드와 기본 플러그인 설정을 같은 revision으로 되돌린다. 저장 데이터나 DB migration은 변경하지 않는다.
