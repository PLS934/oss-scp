## MODIFIED Requirements

### Requirement: 모든 trigger가 같은 대상 실행권을 공유한다
기동, scheduled, 수동 CLI 및 수동 API trigger는 같은 plugin·source·scope type·scope key에 대해 설정 revision과 무관하게 동일한 DB 실행권과 lease 계약에 SHALL 참여해야 한다. trigger 종류, 설정 revision 또는 요청을 받은 API 인스턴스가 달라도 동시에 하나의 실행만 데이터를 확정해야 하며(MUST), 중복 요청은 현재 실행을 참조할 수 있어야 한다(MUST). 설정 revision은 실행 이력과 checkpoint identity에는 보존해야 한다(MUST).

#### Scenario: 수동 API와 기동 수집 충돌
- **WHEN** 기동 수집이 진행 중인 대상에 수동 API 동기화 요청이 도착한다
- **THEN** 수동 요청은 별도 원천 수집을 시작하지 않고 진행 중 실행을 참조하는 중복 결과를 반환한다

#### Scenario: 서로 다른 API 인스턴스의 수동 요청
- **WHEN** 두 API 인스턴스가 같은 대상의 수동 동기화를 동시에 접수한다
- **THEN** DB 실행권을 얻은 하나만 원천 수집을 수행하고 다른 요청은 현재 실행을 참조한다

#### Scenario: 수동 API와 CLI 충돌
- **WHEN** 수동 CLI 실행 중 같은 대상의 수동 API 요청이 접수된다
- **THEN** 두 경로는 같은 실행권을 공유해 두 번째 실행의 데이터·checkpoint 확정을 허용하지 않는다

#### Scenario: 여러 API 인스턴스의 scheduled 실행
- **WHEN** 같은 설정 revision을 사용하는 API 인스턴스 둘 이상이 동일 대상의 예정 시각을 관측한다
- **THEN** DB 실행권을 얻은 하나만 원천 수집과 running 상태 전이를 수행하고 나머지 요청은 실패 run을 만들지 않으며 현재 `activeRunId`, 예정 UTC instant와 timezone을 기존 run FK 기반 duplicate 참조 이력으로 멱등 저장한다

#### Scenario: rolling restart의 서로 다른 revision 경합
- **WHEN** 같은 plugin·source·scope를 가진 이전 revision과 새 revision 인스턴스가 동시에 실행권을 요청한다
- **THEN** revision 비포함 lease를 얻은 하나만 running 상태가 되고 loser는 winner의 `activeRunId`를 참조하며, 이전 revision의 stale 결과는 새 실행 뒤 데이터를 확정하지 못하고 각 실행 이력에는 해당 revision이 보존된다

#### Scenario: scheduled 자식 결과 검증
- **WHEN** scheduled 자식 stdout이 상한을 넘거나 단일 JSON exact event schema, plugin·예정 metadata 또는 exit code와 일치하지 않는다
- **THEN** 부모 scheduler는 active run 참조를 저장하지 않고 원문을 노출하지 않는 안전한 실패로 처리한다

#### Scenario: PostgreSQL 실행 종료 경합
- **WHEN** 둘 이상의 호출이 같은 PostgreSQL running run을 동시에 종료하려 한다
- **THEN** 유효 lease를 가진 running row를 잠근 하나만 상태를 전이하고 나머지는 `RUN_NOT_ACTIVE`로 거부된다

### Requirement: trigger와 요청 상관관계를 비밀정보 없이 기록한다
플랫폼은 실행 이력에서 `startup | scheduled | cli | api` trigger를 구분해야 한다(SHALL). scheduled 대상 실행에는 예정 UTC instant와 설정 IANA timezone을 기록하고, 수동 API 실행에는 요청 식별자와 대상 실행의 상관관계를 조회할 수 있어야 한다(SHALL). 이 상관관계에는 인증 자격증명, Connection 비밀, 원천 응답이나 사용자 제공 임의 문자열을 기록해서는 안 된다(MUST NOT).

#### Scenario: API 실행 이력
- **WHEN** 수동 API 요청이 하나 이상의 대상 실행을 시작하거나 기존 실행과 중복된다
- **THEN** 요청 식별자, api trigger, 대상 결과 또는 참조 실행이 비밀정보 없이 기록된다

#### Scenario: scheduled 실행 이력
- **WHEN** 예정 시각이 활성 저장형 대상의 실행을 시작하거나 기존 실행과 중복된다
- **THEN** scheduled trigger, 예정 UTC instant, 설정 timezone, 대상 결과 또는 참조 실행이 비밀정보 없이 기록된다

#### Scenario: 기존 trigger 호환성
- **WHEN** 기동 수집 또는 수동 CLI 실행이 완료된다
- **THEN** 기존 데이터·checkpoint 의미를 유지하면서 해당 trigger 종류가 실행 이력에 식별된다
