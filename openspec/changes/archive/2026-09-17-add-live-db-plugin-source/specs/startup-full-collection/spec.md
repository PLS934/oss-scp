## MODIFIED Requirements

### Requirement: 기동 시 활성 대상 전체 수집
이 요구사항의 수집 대상은 저장형 소스에 한정한다. `persistence: none` 소스는 대상과 상위 수집 집계에서 SHALL 제외하고 실행·lease·checkpoint를 생성하지 않아야 한다.
API는 최초 실행과 모든 재시작에서 확정된 runtime registry에 등록되고 활성화된 각 수집 대상을 full 범위로 한 번씩 요청해야 한다(SHALL). 누락된 과거 일정을 보충하는 조건으로 기동 실행을 제한해서는 안 된다(MUST NOT).

#### Scenario: 최초 실행
- **WHEN** 플랫폼 DB에는 해당 대상의 수집 이력이 없고 API가 유효한 registry로 시작한다
- **THEN** 각 등록·활성 대상의 full 범위 수집이 한 번 요청된다

#### Scenario: 수집 이력이 있는 재시작
- **WHEN** 이전 수집 성공 또는 실패 이력이 있는 API 인스턴스가 재시작한다
- **THEN** 마지막 실행 시각이나 일정 누락 여부와 무관하게 각 등록·활성 대상의 full 범위 수집이 요청된다

#### Scenario: 빈 registry
- **WHEN** API가 등록·활성 수집 대상이 없는 유효한 registry로 시작한다
- **THEN** API는 정상적으로 요청을 처리하고 새로운 수집 실행이나 대상 작업을 만들지 않는다

#### Scenario: Registry contains only live sources
- **WHEN** 활성 registry에 라이브 소스만 존재한다
- **THEN** 자동 수집과 수집 이력을 만들지 않고 API를 시작한다
