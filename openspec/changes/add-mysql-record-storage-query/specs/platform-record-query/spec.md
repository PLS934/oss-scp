## ADDED Requirements

### Requirement: MySQL reads platform storage with the common query semantics
MySQL 조회 구현은 PostgreSQL과 동일한 공통 목록·상세·수집 상태 계약을 SHALL 구현하고 외부 원천을 호출해서는 안 된다. 목록은 `lastSeenAt` 내림차순과 내부 `id` 오름차순으로 정렬하며 offset 없이 두 값의 keyset 경계로 다음 묶음을 읽어야 한다.

#### Scenario: Source outage does not prevent a MySQL query
- **WHEN** 원천 서비스가 중단되었지만 저장된 레코드와 수집 실행 이력이 MySQL에 있다
- **THEN** 목록과 상세 조회는 MySQL의 저장 결과만으로 성공하며 원천 호출을 발생시키지 않는다

#### Scenario: MySQL cursor continues without duplicate boundary record
- **WHEN** 조회자가 MySQL에서 받은 이전 응답의 cursor로 다음 묶음을 요청한다
- **THEN** MySQL은 이전 마지막 레코드 뒤부터 읽고 경계 레코드를 중복 반환하지 않는다

#### Scenario: MySQL query failure is sanitized
- **WHEN** MySQL 조회가 실패한다
- **THEN** 플랫폼은 드라이버 메시지나 접속 정보를 노출하지 않는 안정된 조회 실패 오류를 반환한다

### Requirement: PostgreSQL and MySQL pagination have equivalent boundaries
플랫폼은 동일 fixture와 동일 cursor 요청에 대해 PostgreSQL과 MySQL에서 같은 정렬·경계·`hasNextPage` 의미를 SHALL 제공해야 한다. datetime은 공통 정밀도로 비교하고 내부 ID와 문자열은 locale 또는 기본 collation에 영향받지 않는 이진 순서를 사용해야 한다.

#### Scenario: Equal timestamps use deterministic identity order
- **WHEN** 여러 레코드가 동일한 `lastSeenAt` 값을 가지고 한 묶음 경계를 가로지른다
- **THEN** 두 DB 구현은 내부 `id` 오름차순으로 같은 순서를 만들고 후속 묶음에 중복이나 누락을 만들지 않는다

#### Scenario: Final partial page is equivalent
- **WHEN** 남은 레코드 수가 요청 크기보다 작은 마지막 묶음을 두 DB에서 조회한다
- **THEN** 두 구현은 같은 의미의 남은 레코드를 반환하고 `hasNextPage=false`와 `nextCursor=null`을 제공한다

#### Scenario: String and null source values do not alter cursor order
- **WHEN** 원천 값에 대소문자가 다른 문자열, null, datetime, 숫자와 중첩 JSON이 혼합되어 있다
- **THEN** 두 구현은 원천 값의 DB별 비교나 표현에 cursor 순서를 의존하지 않고 같은 저장 값을 반환한다
