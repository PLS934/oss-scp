## ADDED Requirements

### Requirement: 외부 배포 설정의 수집 일정
플랫폼은 외부 설정 revision에 선택적 일일 수집 일정을 포함할 수 있어야 하며(SHALL), plugin·Connection registry와 함께 HTTP listen 전에 검증한 불변 snapshot으로 사용해야 한다(SHALL). 실행 중 파일 변경은 일정에 반영해서는 안 된다(MUST NOT).

#### Scenario: 읽기 전용 설정 루트의 일정
- **WHEN** 운영자가 유효한 일정과 plugin registry가 포함된 외부 설정 revision을 읽기 전용으로 주입한다
- **THEN** 플랫폼은 동일 revision의 일정과 수집 대상 snapshot으로 기동한다

#### Scenario: 일정 설정 변경
- **WHEN** 실행 중인 API의 외부 설정 파일에서 일정 값을 변경한다
- **THEN** 현재 timer는 변경되지 않고 재기동 시 전체 설정 검증이 성공한 뒤 새 일정이 적용된다
