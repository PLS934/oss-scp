# collection-run-coordination Specification

## Purpose

여러 API 인스턴스와 수동·자동 실행이 같은 수집 범위를 안전하게 공유하도록 영속 실행 기록, 실행권, revision 및 결과 확정 순서를 정의한다.

## Requirements

### Requirement: 영속 실행 이력과 설정 revision
플랫폼은 각 상위 실행과 대상 실행에 고유 식별자, trigger, plugin·Connection 대상, full 범위, 승인된 설정 revision, 상태, 시작·종료 시각, 성공·오류 건수, 마지막 저장 checkpoint와 전체 범위 완료 여부를 플랫폼 DB에 기록해야 한다(SHALL). 비밀 값이나 해석된 자격증명은 기록해서는 안 된다(MUST NOT).

#### Scenario: 실행 등록
- **WHEN** 기동 전체 수집 요청이 접수된다
- **THEN** 실행 중 사용될 불변 설정 revision과 대상별 pending 또는 running 상태가 데이터 저장 전에 기록된다

#### Scenario: 성공·부분 성공·실패 기록
- **WHEN** 대상 실행이 종료된다
- **THEN** 결과에 맞는 success, partial 또는 failed 상태와 종료 시각·건수·마지막 확정 checkpoint·전체 범위 완료 여부가 원자적으로 기록된다

#### Scenario: 민감정보 없는 오류
- **WHEN** Connection 인증 또는 원천 요청 때문에 실행이 실패한다
- **THEN** 조회 가능한 실행 오류에는 안정적 오류 코드와 비밀정보 없는 요약만 기록된다

### Requirement: 동일 대상·범위의 단일 실행권
플랫폼은 DB 제품과 API 인스턴스 수에 관계없이 같은 설정 revision, plugin·Connection 대상 및 full 범위에 대해 동시에 하나의 실행만 데이터를 확정하도록 SHALL 보장한다. 중복 요청은 별도 수집을 시작하지 않고 현재 실행을 식별 가능한 skipped 결과 또는 기존 실행 참조로 기록해야 한다(SHALL).

#### Scenario: 여러 인스턴스 동시 기동
- **WHEN** 두 API 인스턴스가 같은 registry revision으로 동시에 시작해 같은 대상을 요청한다
- **THEN** 하나만 실행권을 얻어 원천 수집을 수행하고 다른 요청은 같은 범위의 두 번째 수집을 실행하지 않는다

#### Scenario: 수동 full 실행과 중복
- **WHEN** 대상의 수동 full 실행 중 API 기동 요청이 같은 대상·범위에 도착한다
- **THEN** 기동 요청은 진행 중 실행과 중복 수집하지 않고 그 사실과 참조 실행을 조회 가능하게 남긴다

#### Scenario: 서로 다른 대상
- **WHEN** 서로 다른 plugin·Connection 대상의 full 실행이 요청된다
- **THEN** 한 대상의 실행권은 다른 대상의 실행을 막지 않는다

### Requirement: 중단 실행 회수와 오래된 결과 보호
실행권은 소유권 토큰과 만료 가능한 lease를 사용해야 하며(SHALL), 실행기는 처리 중 lease를 갱신해야 한다(SHALL). lease를 잃거나 더 최신 실행에 의해 대체된 실행은 이후 데이터, checkpoint 또는 최종 상태를 확정해서는 안 된다(MUST NOT).

#### Scenario: 중단된 인스턴스의 실행권 회수
- **WHEN** 실행권을 가진 API 인스턴스가 종료되어 lease가 갱신되지 않고 만료된다
- **THEN** 이전 실행은 미완료로 식별되고 후속 요청이 새 실행권을 획득할 수 있다

#### Scenario: 늦게 도착한 이전 실행 결과
- **WHEN** lease를 잃은 이전 실행이 새 실행 시작 뒤 저장 또는 완료를 시도한다
- **THEN** 플랫폼 DB는 소유권·세대 검사를 통해 이전 실행의 결과 확정을 거부한다

#### Scenario: 저장 완료와 checkpoint 확정
- **WHEN** 실행권을 가진 실행이 레코드 묶음을 저장한다
- **THEN** 레코드 upsert와 해당 묶음의 checkpoint 확정은 동일 소유권·세대 조건 아래 일관되게 완료되거나 함께 실패한다

### Requirement: PostgreSQL·MySQL 공통 의미
PostgreSQL과 MySQL storage-adapter는 실행 등록, 단일 실행권, lease 회수, 조건부 묶음 저장, 상태 조회 및 최종화에 동일한 관찰 가능한 결과를 제공해야 한다(SHALL).

#### Scenario: 양쪽 DB의 계약 검증
- **WHEN** 같은 동시 요청·lease 만료·늦은 저장 시나리오를 PostgreSQL과 MySQL 어댑터에 실행한다
- **THEN** 실행 승자, 중복 처리, 저장 데이터, checkpoint 및 최종 상태가 동일한 계약을 충족한다
