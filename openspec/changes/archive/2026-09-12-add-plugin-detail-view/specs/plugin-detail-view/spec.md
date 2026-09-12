## Purpose

#67이 제공하는 검증된 필드 정의로 저장 레코드의 기본 상세 화면과 실패 상태를 안전하고 일관되게 제공한다.

## ADDED Requirements

### Requirement: 선언된 기본 타입을 안전하게 표시한다
클라이언트는 `sourceValues` 중 상세 정의가 선택한 최상위 `string`, `number`, `boolean`, `datetime`, `object`, `array` 필드만 실행 코드나 HTML 해석 없이 SHALL 표시해야 한다. object와 array는 flat 상세 계약에 맞춰 일반적인 재귀 JSON 표현을 사용해야 한다(SHALL).

#### Scenario: scalar와 구조 값
- **WHEN** 레코드가 선언과 일치하는 scalar, object 및 array 값을 가진다
- **THEN** 화면은 정의의 section·label·type 순서에 따라 텍스트 기반 표현으로 표시한다

#### Scenario: null과 누락 값
- **WHEN** 선언된 필드 값이 null이거나 존재하지 않는다
- **THEN** 화면은 두 상태를 구분하고 다른 필드 렌더링을 계속한다

#### Scenario: 선언되지 않은 최상위 값
- **WHEN** 응답에 상세 정의가 선택하지 않은 최상위 필드가 존재한다
- **THEN** 화면은 해당 필드를 표시하지 않는다

#### Scenario: 선언 타입 불일치
- **WHEN** 선택된 필드 값이 선언 타입과 다르다
- **THEN** 화면은 값을 추측하지 않고 표시 불가 상태를 표시한다

### Requirement: 상세 URL과 조회 범위를 검증한다
클라이언트는 등록 메뉴 아래의 내부 UUID를 상세 route로 해석하고 응답의 `pluginId`, `sourceId`, `dataType`이 메뉴 context와 모두 일치할 때만 SHALL 표시해야 한다.

#### Scenario: 직접 URL과 새로고침
- **WHEN** 사용자가 유효한 상세 URL을 직접 열거나 새로고침한다
- **THEN** 클라이언트는 같은 조회 context로 동일 내부 UUID 레코드를 표시한다

#### Scenario: 범위 불일치
- **WHEN** 응답의 범위 식별자 하나라도 현재 메뉴와 다르다
- **THEN** 클라이언트는 값을 표시하지 않고 불일치 상태를 표시한다

### Requirement: 상세 실패 상태를 구분한다
클라이언트는 잘못된 UUID, 존재하지 않는 레코드, 범위 불일치와 그 밖의 API 실패를 구분되는 안전한 상태로 SHALL 표시해야 한다.

#### Scenario: 잘못된 UUID
- **WHEN** `recordId`가 내부 UUID 형식이 아니다
- **THEN** 클라이언트는 네트워크 요청 없이 잘못된 ID 상태를 표시한다

#### Scenario: 존재하지 않는 레코드
- **WHEN** 상세 API가 `RECORD_NOT_FOUND`를 반환한다
- **THEN** 클라이언트는 없는 레코드 상태와 목록 복귀 동작을 표시한다

#### Scenario: API 실패
- **WHEN** 상세 요청이 그 밖의 이유로 실패한다
- **THEN** 클라이언트는 서버 원문이나 비밀정보 없이 재시도 가능한 공통 실패 상태를 표시한다
