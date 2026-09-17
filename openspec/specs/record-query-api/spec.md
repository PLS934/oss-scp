# Record Query API Specification

## Purpose

계정관리 비활성화 상태에서 저장된 공통 레코드 목록·상세와 수집 상태를 일관된 JSON 및 HTTP 오류 계약으로 조회할 최소 NestJS API를 제공한다.

## Requirements

### Requirement: API exposes stored record lists
서버는 `GET /api/v1/records`에서 `pluginId`, `sourceId`, `dataType` 쿼리를 필수로 받고 선택적인 `limit`, `cursor` 또는 `page`를 받아 공통 조회 계약의 `items`, `pageInfo`, 수집 상태와 마지막 저장 시각을 JSON으로 SHALL 반환해야 한다. page가 없으면 기존 cursor 응답을 유지하며 page가 있으면 번호형 pageInfo를 반환해야 한다. page와 cursor 동시 지정, 중복 page 쿼리, 빈 문자열·숫자 이외 문자·0·음수·소수·안전 정수 초과는 HTTP 400 INVALID_QUERY여야 한다.

#### Scenario: Anonymous caller reads a stored list
- **WHEN** 계정관리가 비활성화된 서버에 유효한 범위와 cursor 없이 목록 요청을 보낸다
- **THEN** 서버는 인증을 요구하지 않고 HTTP 200과 첫 레코드 묶음, 다음 cursor 존재 여부, 수집 상태 및 마지막 저장 시각을 반환한다

#### Scenario: Caller reads the next stored batch
- **WHEN** 조회자가 이전 응답의 `nextCursor`를 같은 범위와 limit으로 전달한다
- **THEN** 서버는 HTTP 200과 이어지는 레코드 묶음 및 새로운 pageInfo를 반환한다

#### Scenario: Empty stored range remains distinct from collection state
- **WHEN** 유효한 범위에 저장 레코드는 없지만 수집 실행 이력은 있다
- **THEN** 서버는 HTTP 200, 빈 items와 `hasNextPage=false`를 반환하면서 실제 최신 수집 상태를 유지한다

#### Scenario: Anonymous numbered query
- **WHEN** 계정관리 비활성화 상태에서 유효한 범위와 page=2, limit=20을 요청한다
- **THEN** 인증을 요구하지 않고 HTTP 200, 해당 페이지 items와 전체 건수·총 페이지·현재 페이지·페이지 크기를 반환하며 수집 및 저장 데이터 변경을 수행하지 않는다

#### Scenario: Mixed modes are rejected
- **WHEN** page와 cursor를 함께 지정한다
- **THEN** HTTP 400 INVALID_QUERY를 반환하고 DB를 조회하지 않는다

### Requirement: API exposes stored record details
서버는 `GET /api/v1/records/:id`에서 내부 UUID로 공통 조회 계약의 단건 상세를 JSON으로 SHALL 반환해야 한다.

#### Scenario: Existing record detail
- **WHEN** 존재하는 내부 UUID로 상세 요청을 보낸다
- **THEN** 서버는 HTTP 200과 저장된 전체 레코드 상세를 반환한다

#### Scenario: Missing record detail
- **WHEN** 유효하지만 존재하지 않는 UUID로 상세 요청을 보낸다
- **THEN** 서버는 HTTP 404와 원천 또는 DB 내부 정보를 포함하지 않는 오류 응답을 반환한다

### Requirement: API maps query failures consistently
서버는 잘못된 일반 조회 입력을 HTTP 400 `INVALID_QUERY`로, 잘못되거나 다른 조건에 귀속된 cursor를 HTTP 400 `INVALID_CURSOR`로, 저장소 조회 실패를 HTTP 503으로 SHALL 변환하고 내부 드라이버 메시지·SQL·접속 정보나 cursor 내부 값을 응답에 포함해서는 안 된다.

#### Scenario: Invalid request parameters
- **WHEN** 필수 범위가 없거나 비어 있고, limit이 허용되지 않거나 상세 ID가 UUID 형식이 아니다
- **THEN** 서버는 HTTP 400과 `INVALID_QUERY`를 반환한다

#### Scenario: Invalid cursor
- **WHEN** cursor가 디코딩되지 않거나 버전·범위·limit·정렬이 현재 요청과 일치하지 않는다
- **THEN** 서버는 DB 조회 전에 HTTP 400과 `INVALID_CURSOR`를 반환한다

#### Scenario: Platform database query fails
- **WHEN** 유효한 요청 중 플랫폼 DB 조회가 실패한다
- **THEN** 서버는 HTTP 503과 안정된 오류 코드·메시지를 반환하고 원천 조회로 대체하지 않는다

### Requirement: Query API remains a read-only boundary
저장형 조회 API는 원천 connector를 MUST 호출하지 않아야 한다. 명시적으로 등록된 무저장 라이브 소스 조회만 읽기 전용 원천 connector 호출을 허용하며, 모든 조회 API는 수집 실행 또는 저장 데이터 변경을 MUST 호출하지 않아야 하며, 후속 권한 검사 계층을 controller와 DB adapter 사이에 추가할 수 있는 서비스 경계를 유지해야 한다.

#### Scenario: Query has no collection side effect
- **WHEN** 저장형 목록 또는 상세 API를 호출한다
- **THEN** 서버는 플랫폼 DB 읽기만 수행하고 수집 실행·checkpoint·레코드·담당자 데이터를 변경하지 않는다

### Requirement: API routes declared live queries
`GET /api/v1/records`는 선언된 라이브 범위에 한해 번호형 page 조회를 SHALL 제공하고 page 생략 시 1을 사용하며 cursor는 거부해야 한다. 기존 20·50·100·200 limit을 유지하고 source 행 상한보다 큰 요청은 거부해야 한다. 라이브 응답은 `mode: live`, `items`, 번호형 `pageInfo`, `queriedAt`을 포함하고 저장·수집 시각을 만들어내지 않아야 한다. 클라이언트는 라이브 상태와 원천 오류를 표시하고 기존 목록·상세 화면의 선언을 재사용해야 한다.

#### Scenario: Live list succeeds
- **WHEN** 활성 라이브 범위에 유효한 목록 조건으로 요청한다
- **THEN** 원천에서 번호형 목록을 조회하고 정확한 전체 건수와 라이브 상태를 반환한다

#### Scenario: Source unavailable
- **WHEN** 원천 연결 또는 질의가 실패한다
- **THEN** 비밀·SQL 없는 HTTP 503 QUERY_FAILED를 반환하고 빈 성공이나 저장 데이터로 대체하지 않는다

### Requirement: Live details use scoped external identity
`GET /api/v1/live-records/detail`은 pluginId·sourceId·dataType·externalKey로 라이브 상세를 SHALL 조회해야 한다. 현재 registry의 활성 범위를 검증한 뒤 외부 키를 바인딩하고 저장형 UUID 상세 경로는 유지해야 한다. 라이브 레코드는 외부 키로 안정적으로 식별하고 관측·저장 시각을 임의 생성하지 않아야 한다.

#### Scenario: Detail reload and missing record
- **WHEN** 목록을 먼저 읽지 않은 클라이언트가 유효한 라이브 상세 링크를 열거나 원천에서 삭제된 키를 조회한다
- **THEN** 메모리 식별자 매핑 없이 상세를 반환하거나 HTTP 404를 반환한다

#### Scenario: Unregistered scope
- **WHEN** 비활성 또는 미등록 라이브 범위를 요청한다
- **THEN** 원천 연결 없이 요청을 거부한다

### Requirement: 허용된 단일 정렬 요청을 검증한다
`GET /api/v1/records`의 번호형 page 요청은 선택적 `sort`와 `direction`을 받아야 하며 둘은 함께 각각 선언된 필드 key와 `asc|desc`여야 한다(SHALL). 서버는 현재 플러그인·데이터 종류의 목록 정렬 선언을 기준으로 검증하고 미허용·중복·부분·잘못된 값 및 cursor 모드의 사용자 정렬은 DB 접근 전에 HTTP 400 `INVALID_QUERY`로 거부해야 한다(MUST).

#### Scenario: 정상 정렬 요청
- **WHEN** 조회자가 정렬 가능 필드와 asc 또는 desc를 함께 전달한다
- **THEN** 서버는 검색·필터와 정렬을 결합해 HTTP 200 목록을 반환한다

#### Scenario: 미허용 정렬 우회
- **WHEN** 조회자가 메뉴에 없는 필드, 둘 중 하나만 있는 파라미터, 중복 값 또는 지원하지 않는 방향을 전달한다
- **THEN** 서버는 DB 조회 전에 HTTP 400 INVALID_QUERY를 반환한다

#### Scenario: cursor 모드 호환
- **WHEN** 조회자가 page 없이 사용자 정렬을 전달하거나 cursor와 결합한다
- **THEN** 서버는 INVALID_QUERY로 거부하고 정렬 파라미터가 없는 cursor 요청은 기존 고정 keyset 순서를 유지한다
