## ADDED Requirements

### Requirement: 허용된 scalar 값을 양쪽 DB에서 동일하게 정렬한다
플랫폼 DB는 검증된 단일 string, number, boolean, datetime 정렬을 검색·필터 이후와 페이지 분할 이전에 SHALL 적용해야 한다. 유효한 값은 요청 방향으로 정렬하고 null·타입 불일치·잘못된 값은 방향과 무관하게 뒤에 배치해야 한다. 문자열은 검색의 ASCII 비교 계약과 같은 결정적 비교를 사용하고, 같은 값은 `lastSeenAt DESC, id ASC`로 안정화해야 한다. 정렬이 없으면 기존 `lastSeenAt DESC, id ASC`를 유지해야 한다.

#### Scenario: 타입별 오름차순과 내림차순
- **WHEN** string, number, boolean 또는 datetime 정렬로 같은 fixture를 조회한다
- **THEN** PostgreSQL과 MySQL은 유효값, null·잘못된 값, 동일값 경계를 포함해 같은 순서를 반환한다

#### Scenario: 번호형 페이지 경계
- **WHEN** 정렬값이 같은 레코드가 페이지 경계에 걸쳐 있다
- **THEN** 안정화 정렬로 중복·누락 없이 결정적인 번호형 페이지 결과를 제공한다

#### Scenario: 정렬 없는 호환 조회
- **WHEN** 정렬 조건 없이 기존 목록을 조회한다
- **THEN** 기존 저장 시각 내림차순과 내부 ID 오름차순 결과를 유지한다

