## ADDED Requirements

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
