## ADDED Requirements

### Requirement: MySQL implementation follows the common storage contract
MySQL 저장 구현은 versioned migration과 PostgreSQL 구현이 사용하는 동일한 공통 저장 인터페이스를 SHALL 제공해야 한다. 실제 지원 MySQL에서 범위·키 타입을 보존한 식별, 재수집 upsert, 관계 무결성, 수집 실행, checkpoint와 격리 오류를 검증하고, DB 제품의 문자열 collation이나 JSON·datetime 표현 차이가 공통 의미를 바꾸어서는 안 된다.

#### Scenario: Fresh MySQL database applies the storage migration
- **WHEN** 기존 MySQL baseline migration이 적용된 빈 데이터베이스에 공통 저장 migration 명령을 실행한다
- **THEN** 공통 저장에 필요한 테이블·제약·인덱스가 생성되고 같은 명령의 재실행은 안전하게 완료된다

#### Scenario: Contract suite passes against MySQL
- **WHEN** PostgreSQL에 적용하는 동일한 공통 저장 fixture를 MySQL 구현에 실행한다
- **THEN** 범위 구분, 대소문자를 포함한 외부 키 구분, 내부 ID 유지, 중복 거부, 관계 무결성, JSON의 null·숫자·문자열·중첩 값 보존과 transaction rollback이 같은 외부 결과로 검증된다

#### Scenario: Failed MySQL batch preserves data and checkpoint
- **WHEN** MySQL에서 레코드 또는 관계 저장이 실패해 한 묶음을 확정할 수 없다
- **THEN** 해당 묶음의 레코드·관계·격리 오류·집계 변경을 롤백하고 이전 checkpoint를 유지하여 같은 시작 위치에서 재개할 수 있다

#### Scenario: Re-collection preserves identity in both products
- **WHEN** 같은 fixture의 동일 범위·키 레코드를 PostgreSQL과 MySQL에 각각 다시 저장한다
- **THEN** 두 구현 모두 기존 내부 ID와 플랫폼 소유 정보를 유지하고 원천 값과 관측 시각만 갱신한다
