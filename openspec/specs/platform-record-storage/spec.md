# Platform Record Storage Specification

## Purpose

가공·검증된 여러 플러그인 데이터와 관계를 공통 형식으로 영속화하고, 수집 실행의 checkpoint 및 격리 오류를 데이터와 일관되게 확정하여 중복이나 누락 없이 재개할 수 있게 한다.

## Requirements

### Requirement: Scoped records preserve identity across delivery
플랫폼은 검증된 레코드를 플러그인 ID, 데이터 종류, 수집처 ID, 외부 키 타입과 외부 키 값의 결합으로 식별하여 SHALL 저장해야 한다. 문자열 키와 숫자 키는 구분되어야 하며, 동일 범위와 키의 재전달은 기존 내부 ID를 유지하면서 원천 값을 갱신해야 한다.

#### Scenario: Re-delivery updates the existing record
- **WHEN** 동일한 플러그인·데이터 종류·수집처·외부 키 타입·외부 키 값의 레코드가 다시 저장된다
- **THEN** 플랫폼은 새 레코드를 만들지 않고 기존 내부 ID를 유지하며 원천 값을 갱신한다

#### Scenario: Equal key values from different scopes remain distinct
- **WHEN** 외부 키의 표시 값은 같지만 플러그인, 데이터 종류, 수집처 또는 키 타입 중 하나가 다른 레코드가 저장된다
- **THEN** 플랫폼은 각각 서로 다른 내부 ID를 가진 레코드로 저장한다

#### Scenario: Duplicate keys within one storage batch are rejected
- **WHEN** 한 저장 묶음에 같은 범위와 타입 보존 외부 키를 가진 레코드가 둘 이상 포함된다
- **THEN** 플랫폼은 명시적인 중복 키 오류로 묶음 전체를 거부하고 데이터와 checkpoint를 변경하지 않는다

### Requirement: Stored source values are validated and bounded
플랫폼은 공통 가공·검증을 통과한 레코드만 저장 입력으로 받아야 하며 SHALL, 정의되지 않은 원천 필드를 별도 업무 컬럼으로 승격하지 않고 제한된 JSON 값으로 보존해야 한다. 단일 레코드 JSON은 직렬화 기준 1 MiB를 초과해서는 안 되며 숫자는 유한한 값이어야 한다.

#### Scenario: Valid heterogeneous records share the same contract
- **WHEN** 서로 다른 플러그인의 asset과 finding 데이터가 각각의 정의에 따라 검증되어 전달된다
- **THEN** 플랫폼은 본체 테이블이나 repository를 데이터 종류별로 추가하지 않고 같은 저장 계약으로 두 레코드를 저장한다

#### Scenario: Oversized record is rejected before persistence
- **WHEN** 단일 레코드의 원천 값이 직렬화 기준 1 MiB를 초과한다
- **THEN** 플랫폼은 크기 제한 오류로 저장 묶음을 거부하고 해당 묶음의 데이터와 checkpoint를 변경하지 않는다

### Requirement: Record relations are idempotent and referentially valid
플랫폼은 관계 종류와 양 끝 레코드의 내부 ID를 저장해야 SHALL 하며, 관계의 양 끝은 같은 플러그인·수집처 범위에서 저장되어 있거나 같은 묶음에서 저장되는 레코드여야 한다. 동일 관계의 재전달은 중복 행을 만들지 않아야 한다.

#### Scenario: Relation endpoints are resolved after record upsert
- **WHEN** 한 묶음이 레코드와 그 레코드를 참조하는 관계를 함께 전달한다
- **THEN** 플랫폼은 레코드를 먼저 식별·갱신한 뒤 내부 ID로 관계를 저장한다

#### Scenario: Missing relation endpoint rolls back the batch
- **WHEN** 관계가 같은 범위에 존재하지 않고 현재 묶음에도 없는 레코드를 참조한다
- **THEN** 플랫폼은 관계 참조 오류로 묶음 전체를 거부하고 데이터와 checkpoint를 변경하지 않는다

### Requirement: Batch data and checkpoint are committed atomically
플랫폼은 한 저장 묶음의 레코드, 관계, 격리 오류와 다음 checkpoint를 단일 트랜잭션으로 SHALL 확정해야 한다. checkpoint는 플러그인·수집처·실행 범위·설정 revision에 귀속되어야 하며 JSON 직렬화 기준 64 KiB를 초과해서는 안 된다.

#### Scenario: Successful batch advances its checkpoint
- **WHEN** 묶음의 레코드·관계·격리 오류가 모두 성공적으로 저장된다
- **THEN** 플랫폼은 같은 트랜잭션에서 해당 범위의 checkpoint를 다음 값으로 갱신한다

#### Scenario: Persistence failure keeps the previous checkpoint
- **WHEN** 데이터 또는 관계 저장 중 오류가 발생한다
- **THEN** 플랫폼은 묶음의 모든 변경을 롤백하고 이전 checkpoint를 그대로 유지한다

#### Scenario: Completed full collection starts a new traversal
- **WHEN** 성공 또는 부분 성공으로 완료된 전체 범위를 다시 수집한다
- **THEN** 플랫폼은 이전 완료 위치를 보존하되 새 실행에는 `null` 시작 checkpoint를 반환하고 첫 묶음이 기존 완료 checkpoint를 안전하게 대체하도록 허용한다

#### Scenario: Failed full collection resumes
- **WHEN** 일부 묶음이 확정된 전체 실행이 후속 묶음 저장에 실패한 뒤 다시 실행된다
- **THEN** 플랫폼은 마지막으로 확정된 checkpoint를 반환하여 실패한 묶음부터 수집을 재개한다

#### Scenario: Retry after rollback has no gaps
- **WHEN** 실패한 묶음이 이전 checkpoint부터 다시 전달된다
- **THEN** 플랫폼은 누락 없이 묶음을 저장하고 이미 확정된 레코드가 재전달되더라도 내부 ID를 유지한다

### Requirement: Collection runs and isolated issues remain auditable
플랫폼은 각 수집 실행의 범위, 설정 revision, 시작·종료 시각, 상태, 처리·성공·격리 건수를 SHALL 기록해야 한다. 격리 오류는 실행, 묶음 시작 checkpoint, 원천 레코드 위치, 제한된 오류 코드·경로·메시지·키 힌트를 기록하고 원천 레코드 전체나 비밀정보를 저장해서는 안 된다.

#### Scenario: Partial run records isolated failures
- **WHEN** 정상 레코드와 격리 오류가 함께 있는 수집 실행이 종료된다
- **THEN** 플랫폼은 실행을 partial로 기록하고 격리 오류를 재처리 위치와 연결하며 정상 데이터는 유지한다

#### Scenario: Completed run exposes aggregate counts
- **WHEN** 수집 실행이 완료된다
- **THEN** 플랫폼은 저장된 실행 기록에서 처리·성공·격리 건수와 최종 상태를 확인할 수 있게 한다

### Requirement: Source updates cannot overwrite platform-owned data
플랫폼은 원천이 갱신하는 JSON 값과 플랫폼이 소유하는 담당자·감사·수동 상태 정보를 물리적으로 분리해야 SHALL 한다. 공통 레코드 upsert는 플랫폼 소유 정보를 생성·변경·삭제해서는 안 된다.

#### Scenario: Re-collection preserves platform-owned fields
- **WHEN** 플랫폼 업무 정보가 연결된 레코드의 원천 값이 재수집으로 갱신된다
- **THEN** 플랫폼은 내부 ID와 플랫폼 업무 정보를 보존하고 원천 값과 관측 시각만 갱신한다

### Requirement: PostgreSQL implementation follows the common storage contract
PostgreSQL 저장 구현은 versioned migration과 공통 저장 인터페이스를 SHALL 제공하며, 실제 지원 PostgreSQL에서 식별·upsert·관계·실행·checkpoint·격리 오류·rollback 시나리오를 검증해야 한다.

#### Scenario: Fresh database applies the storage migration
- **WHEN** 기존 migration이 적용된 빈 PostgreSQL 데이터베이스에 새 migration 명령을 실행한다
- **THEN** 공통 저장에 필요한 테이블·제약·인덱스가 생성되고 재실행은 안전하게 완료된다

#### Scenario: Contract suite passes against PostgreSQL
- **WHEN** PostgreSQL 구현에 공통 저장 계약 테스트를 실행한다
- **THEN** 범위 구분, 내부 ID 유지, 중복 거부, 관계 무결성, 업무 정보 보존과 트랜잭션 rollback이 모두 검증된다

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
