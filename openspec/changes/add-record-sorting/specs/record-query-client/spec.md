## ADDED Requirements

### Requirement: 목록 정렬을 타입 안전하게 요청한다
클라이언트는 선택적 단일 정렬의 필드와 `asc|desc` 방향을 함께 URL 인코딩하고 한쪽만 있거나 잘못된 방향이면 네트워크 요청 전에 `INVALID_INPUT`으로 반환해야 한다(SHALL). 정렬이 없으면 기존 요청 URL을 유지해야 한다.

#### Scenario: 정렬 직렬화
- **WHEN** 호출자가 유효한 필드와 방향으로 번호형 목록을 요청한다
- **THEN** 클라이언트는 기존 범위·page·limit·검색·필터와 sort·direction을 한 요청에 전달한다

#### Scenario: 정렬 없는 기존 호출
- **WHEN** 호출자가 정렬을 전달하지 않는다
- **THEN** 클라이언트는 sort·direction을 생성하지 않고 기존 결과 계약을 유지한다

