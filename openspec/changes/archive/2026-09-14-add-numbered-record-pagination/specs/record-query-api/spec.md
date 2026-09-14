## MODIFIED Requirements

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

