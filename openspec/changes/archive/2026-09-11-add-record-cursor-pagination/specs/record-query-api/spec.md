## MODIFIED Requirements

### Requirement: API exposes stored record lists
서버는 `GET /api/v1/records`에서 `pluginId`, `sourceId`, `dataType` 쿼리를 필수로 받고 선택적인 `limit`과 `cursor`를 받아 공통 조회 계약의 `items`, `pageInfo`, 수집 상태와 마지막 저장 시각을 JSON으로 SHALL 반환해야 한다.

#### Scenario: Anonymous caller reads a stored list
- **WHEN** 계정관리가 비활성화된 서버에 유효한 범위와 cursor 없이 목록 요청을 보낸다
- **THEN** 서버는 인증을 요구하지 않고 HTTP 200과 첫 레코드 묶음, 다음 cursor 존재 여부, 수집 상태 및 마지막 저장 시각을 반환한다

#### Scenario: Caller reads the next stored batch
- **WHEN** 조회자가 이전 응답의 `nextCursor`를 같은 범위와 limit으로 전달한다
- **THEN** 서버는 HTTP 200과 이어지는 레코드 묶음 및 새로운 pageInfo를 반환한다

#### Scenario: Empty stored range remains distinct from collection state
- **WHEN** 유효한 범위에 저장 레코드는 없지만 수집 실행 이력은 있다
- **THEN** 서버는 HTTP 200, 빈 items와 `hasNextPage=false`를 반환하면서 실제 최신 수집 상태를 유지한다

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
