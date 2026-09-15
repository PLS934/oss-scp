# record-query-client Specification

## Purpose

React 화면이 플랫폼 DB의 저장 레코드 목록과 상세를 동일한 타입·검증·오류 계약으로 안전하게 조회하도록 공통 클라이언트 경계를 제공한다.

## Requirements

### Requirement: 저장 레코드 목록을 타입 안전하게 조회한다
클라이언트는 pluginId, sourceId, dataType, 선택적 limit과 cursor 또는 page를 받아 동일 출처 `GET /api/v1/records`를 호출하고, 검증된 items, pageInfo, collection과 lastStoredAt을 성공 결과로 반환해야 한다(SHALL). limit은 생략하거나 20·50·100·200 중 하나여야 하며 필수 식별자는 비어 있지 않아야 한다.

#### Scenario: 첫 묶음 조회
- **WHEN** 호출자가 유효한 조회 범위와 cursor 없이 목록을 요청한다
- **THEN** 클라이언트는 cursor 없는 동일 출처 URL을 호출하고 검증된 목록 결과를 반환한다

#### Scenario: 후속 묶음 조회
- **WHEN** 호출자가 이전 응답의 nextCursor와 같은 조회 범위·limit으로 목록을 요청한다
- **THEN** 클라이언트는 cursor를 해석하지 않고 안전하게 인코딩해 같은 함수로 후속 묶음을 조회한다

#### Scenario: 빈 조회 결과와 미수집 상태
- **WHEN** API가 빈 items, 종료 pageInfo, `never_collected` collection과 null lastStoredAt을 반환한다
- **THEN** 클라이언트는 이를 오류가 아닌 유효한 빈 목록 결과로 반환한다

#### Scenario: 잘못된 목록 입력
- **WHEN** 필수 식별자가 누락·공백이거나 limit이 허용 목록 밖이다
- **THEN** 클라이언트는 네트워크 요청 전에 `INVALID_INPUT` 실패 결과를 반환한다

#### Scenario: Numbered response validation
- **WHEN** 호출자가 page를 지정한다
- **THEN** 클라이언트는 page와 limit을 인코딩하고 번호형 pageInfo의 안전 정수·범위·총 건수와 총 페이지 수 관계·items 수·hasNextPage 일관성을 검증한다. 잘못된 입력은 INVALID_INPUT, 잘못된 응답은 INVALID_RESPONSE로 반환한다

### Requirement: 저장 레코드 상세를 타입 안전하게 조회한다
클라이언트는 플랫폼 내부 레코드 UUID를 안전하게 경로 인코딩하여 동일 출처 `GET /api/v1/records/:id`를 호출하고 검증된 상세 레코드를 성공 결과로 반환해야 한다(SHALL).

#### Scenario: 정상 상세 조회
- **WHEN** 호출자가 유효한 UUID로 상세를 요청하고 API가 정상 레코드를 반환한다
- **THEN** 클라이언트는 검증된 전체 sourceValues와 식별·관측 정보를 반환한다

#### Scenario: 존재하지 않는 상세
- **WHEN** API가 `RECORD_NOT_FOUND` 코드와 HTTP 404를 반환한다
- **THEN** 클라이언트는 다른 조회 실패와 구분되는 `NOT_FOUND` 실패 결과를 반환한다

#### Scenario: 잘못된 상세 입력
- **WHEN** 호출자가 유효하지 않은 UUID를 전달한다
- **THEN** 클라이언트는 네트워크 요청 전에 `INVALID_INPUT` 실패 결과를 반환한다

### Requirement: 응답과 실패를 화면용 결과로 분류한다
클라이언트는 성공과 실패를 판별 가능한 결과 타입으로 반환하고, 서버 본문 전체·Connection 정보·내부 오류를 노출하지 않아야 한다(SHALL). 정상 응답의 필수 필드와 JSON 값 구조를 런타임에 검증해야 한다(MUST).

#### Scenario: 잘못된 cursor
- **WHEN** API가 `INVALID_CURSOR` 코드와 HTTP 400을 반환한다
- **THEN** 클라이언트는 일반 입력 오류나 API 실패가 아닌 `INVALID_CURSOR` 실패 결과를 반환한다

#### Scenario: 준비되지 않은 플랫폼 DB
- **WHEN** API가 HTTP 503을 반환한다
- **THEN** 클라이언트는 화면이 재시도 안내에 사용할 수 있는 `NOT_READY` 실패 결과를 반환한다

#### Scenario: 잘못된 정상 응답
- **WHEN** HTTP 200 응답이 JSON이 아니거나 목록·상세 계약의 필수 필드 또는 타입을 만족하지 않는다
- **THEN** 클라이언트는 응답 원문을 포함하지 않는 `INVALID_RESPONSE` 실패 결과를 반환한다

#### Scenario: 일반 API 실패
- **WHEN** 응답이 알려진 400·404·503 계약과 일치하지 않는 실패 상태다
- **THEN** 클라이언트는 안전한 공통 메시지의 `API_ERROR` 실패 결과를 반환한다

#### Scenario: 네트워크 실패
- **WHEN** 요청이 응답 전에 네트워크 오류로 실패한다
- **THEN** 클라이언트는 `NETWORK_ERROR` 실패 결과를 반환한다

### Requirement: 호출자가 요청을 취소할 수 있다
목록과 상세 함수는 호출자가 제공하는 AbortSignal을 요청에 전달하고 취소를 다른 실패와 구분해야 한다(SHALL).

#### Scenario: 취소된 요청
- **WHEN** 호출자가 요청 중 AbortSignal을 취소한다
- **THEN** 클라이언트는 `ABORTED` 실패 결과를 반환하여 화면이 기존 또는 후속 상태를 유지할 수 있게 한다

### Requirement: 현재 서버 계약의 경계를 유지한다
클라이언트는 서버가 반환한 선언된 필드만 사용하고 브라우저에서 원천 API·DB·Connection에 접근하거나 응답에 없는 값을 추정하지 않아야 한다(MUST).

#### Scenario: 동일 출처 API 사용
- **WHEN** 목록 또는 상세 요청을 생성한다
- **THEN** URL은 `/api/v1/records` 아래의 상대 경로이며 원천 주소나 Connection 정보가 포함되지 않는다

#### Scenario: 서버 계약 준수
- **WHEN** 현재 조회 함수를 사용한다
- **THEN** 서버가 제공하지 않은 값이나 파라미터를 추정하여 생성하지 않는다

### Requirement: 목록 정렬을 타입 안전하게 요청한다
클라이언트는 선택적 단일 정렬의 필드와 `asc|desc` 방향을 함께 URL 인코딩하고 한쪽만 있거나 잘못된 방향이면 네트워크 요청 전에 `INVALID_INPUT`으로 반환해야 한다(SHALL). 정렬이 없으면 기존 요청 URL을 유지해야 한다.

#### Scenario: 정렬 직렬화
- **WHEN** 호출자가 유효한 필드와 방향으로 번호형 목록을 요청한다
- **THEN** 클라이언트는 기존 범위·page·limit·검색·필터와 sort·direction을 한 요청에 전달한다

#### Scenario: 정렬 없는 기존 호출
- **WHEN** 호출자가 정렬을 전달하지 않는다
- **THEN** 클라이언트는 sort·direction을 생성하지 않고 기존 결과 계약을 유지한다
