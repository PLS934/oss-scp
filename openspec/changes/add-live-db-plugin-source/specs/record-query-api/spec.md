## MODIFIED Requirements

### Requirement: Query API remains a read-only boundary
저장형 조회 API는 원천 connector를 MUST 호출하지 않아야 한다. 명시적으로 등록된 무저장 라이브 소스 조회만 읽기 전용 원천 connector 호출을 허용하며, 모든 조회 API는 수집 실행 또는 저장 데이터 변경을 MUST 호출하지 않아야 하며, 후속 권한 검사 계층을 controller와 DB adapter 사이에 추가할 수 있는 서비스 경계를 유지해야 한다.

#### Scenario: Query has no collection side effect
- **WHEN** 저장형 목록 또는 상세 API를 호출한다
- **THEN** 서버는 플랫폼 DB 읽기만 수행하고 수집 실행·checkpoint·레코드·담당자 데이터를 변경하지 않는다

## ADDED Requirements

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
