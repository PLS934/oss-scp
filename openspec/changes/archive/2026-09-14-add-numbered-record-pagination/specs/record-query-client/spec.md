## MODIFIED Requirements

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


### Requirement: 현재 서버 계약의 경계를 유지한다
클라이언트는 서버가 반환한 선언된 필드만 사용하고 브라우저에서 원천 API·DB·Connection에 접근하거나 응답에 없는 값을 추정하지 않아야 한다(MUST).

#### Scenario: 동일 출처 API 사용
- **WHEN** 목록 또는 상세 요청을 생성한다
- **THEN** URL은 `/api/v1/records` 아래의 상대 경로이며 원천 주소나 Connection 정보가 포함되지 않는다

#### Scenario: 후속 기능 제외
- **WHEN** 현재 조회 함수를 사용한다
- **THEN** 서버가 제공하지 않은 전체 건수나 페이지를 추정하지 않고 이전 cursor, 검색·필터·사용자 지정 정렬 파라미터를 생성하지 않는다
