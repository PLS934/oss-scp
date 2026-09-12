## Context

#67은 메뉴 산출물에 flat `key`, `label`, `type` 상세 메타데이터를 제공하고, #53은 같은 메뉴 조회 범위로 저장 레코드 목록을 표시한다. 상세 API는 내부 UUID로 레코드를 반환하지만 현재 웹에는 목록 진입 링크와 공통 상세 renderer가 없다.

## Goals / Non-Goals

**Goals:**

- #67 계약을 변경하지 않고 공통 상세 화면에서 소비한다.
- 목록과 상세 URL에 저장 레코드 내부 UUID를 사용한다.
- 메뉴 context와 응답 범위를 비교해 다른 플러그인의 레코드가 표시되지 않게 한다.
- 타입별 표현과 상태 분류를 작은 함수·컴포넌트로 검증한다.

**Non-Goals:**

- 중첩 field schema, 전용 위젯 또는 HTML 렌더링을 추가하지 않는다.
- 상세 API, plugin-config 계약이나 저장 모델을 변경하지 않는다.
- 큰 본문 다운로드, 관계 탐색, 편집과 사용자 정의 화면을 구현하지 않는다.

## Decisions

### #67의 flat 상세 메타데이터를 그대로 소비한다

section·field 순서와 최상위 field 선택만 사용한다. object와 array에는 하위 schema가 없으므로 값을 재귀적인 텍스트 기반 JSON 표현으로 표시한다. 선택되지 않은 최상위 필드는 표시하지 않는다.

### 메뉴 경로 아래 `/:recordId`를 상세 route로 사용한다

메뉴 path 다음 세그먼트를 내부 UUID로 해석한다. 성공 후 `pluginId`, `sourceId`, `dataType`을 메뉴 context와 모두 비교하며, 범위가 다르면 값을 렌더링하지 않는다.

### 모든 값은 React 텍스트 노드로 표시한다

scalar와 datetime 타입을 확인한다. object key와 array item도 HTML 해석이나 동적 코드 실행 없이 재귀 표시한다. null은 `값 없음`, key 자체가 없으면 `필드 누락`, 타입이 다르면 `표시할 수 없는 값`으로 구분한다.

### 목록과 상세가 하나의 경로 helper를 공유한다

목록의 `보기` 링크는 `menu.path`와 저장 레코드 `id`를 공통 helper로 조합한다. 상세의 복귀 링크는 같은 `menu.path`를 사용하며 외부 key는 URL 식별자로 사용하지 않는다.

### 실패 상태를 결정적으로 분류한다

UUID 오류는 요청 전에 차단하고, `NOT_FOUND`, context 불일치, 재시도 가능한 일반 실패를 구분한다. route 변경에 따른 취소 결과는 화면 오류로 반영하지 않는다.

## Risks / Trade-offs

- [object·array가 크거나 깊을 수 있음] → 선택된 최상위 필드만 렌더링하고 큰 본문은 지원 범위에서 제외한다.
- [flat 계약은 중첩 키별 숨김을 지원하지 않음] → 플러그인 작성자는 비밀정보나 큰 본문을 포함한 최상위 필드를 선택하지 않아야 한다.
- [UUID 조회의 범위 혼동] → 응답의 세 범위 식별자가 모두 일치할 때만 내용을 표시한다.

## Migration Plan

DB 또는 설정 migration은 없다. 웹 배포를 되돌리면 목록 링크와 상세 route가 함께 이전 상태로 돌아간다.
