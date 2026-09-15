## ADDED Requirements

### Requirement: scalar 목록 필드의 정렬 가능 여부를 선언한다
플러그인은 기본 목록에 포함된 최상위 string, number, boolean, datetime 필드에 선택적 `sortable: true`를 SHALL 선언할 수 있어야 한다. 생략은 정렬 불가로 해석하며 false, 문자열, 중첩 object·array 및 목록 밖 필드의 정렬 선언은 검증 오류여야 한다.

#### Scenario: 정렬 가능한 목록 필드
- **WHEN** 플러그인이 목록에 포함된 최상위 scalar 필드에 `sortable: true`를 선언한다
- **THEN** 플랫폼은 필드 key·표시명·타입을 정렬 허용 선언에 포함한다

#### Scenario: 잘못된 정렬 선언
- **WHEN** 플러그인이 지원하지 않는 값이나 중첩·비목록 필드를 정렬 가능으로 선언한다
- **THEN** 플랫폼은 기동 전 해당 선언 경로를 식별해 설정을 거부한다

