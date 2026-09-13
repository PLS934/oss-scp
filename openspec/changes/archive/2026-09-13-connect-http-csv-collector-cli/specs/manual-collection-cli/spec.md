## ADDED Requirements

### Requirement: HTTP CSV 플러그인의 공통 CLI 실행
CLI는 SHALL registry에서 선택한 HTTP CSV 플러그인의 응답을 제한된 행 묶음으로 수집하여 다른 지원 source와 동일한 가공·검증·저장 코어에 전달해야 한다. 각 묶음은 저장 전 기대 checkpoint, 저장 후 확정할 다음 numeric checkpoint와 HTTP CSV source가 보고한 전체 응답 완료 여부를 전달해야 한다.

#### Scenario: HTTP CSV 전체 수동 수집
- **WHEN** 운영자가 유효한 HTTP CSV 플러그인 ID로 수동 CLI를 실행하고 원천이 여러 묶음의 유효한 CSV를 반환한다
- **THEN** CLI는 `unsupported_collector` 없이 모든 행을 순서대로 공통 수집 코어에 전달하고 마지막 묶음의 전체 완료 여부를 기록한다

#### Scenario: API 기동 수집의 HTTP CSV 실행
- **WHEN** API가 등록된 HTTP CSV 플러그인을 기동 전체 수집 대상으로 실행한다
- **THEN** API는 수동 실행과 같은 CLI 코어를 사용하여 HTTP CSV 행을 저장하고 대상별 실행 결과를 기록한다

### Requirement: HTTP CSV numeric checkpoint 재개
CLI는 SHALL HTTP CSV 실행의 저장 완료 numeric checkpoint를 확정된 행 수로 해석하고 재실행 시 해당 행을 건너뛴 뒤 남은 행만 전달해야 한다. checkpoint는 성공적으로 저장된 묶음 뒤에만 진행해야 하며 실패하거나 취소된 묶음의 행을 확정해서는 안 된다(MUST NOT).

#### Scenario: 저장 완료 행 이후 재개
- **WHEN** HTTP CSV 실행이 numeric checkpoint와 함께 다시 시작되고 원천이 같은 순서의 CSV를 반환한다
- **THEN** CLI는 checkpoint 이전 행을 전달하지 않고 첫 미확정 행부터 순서대로 수집한다

#### Scenario: 묶음 경계 내부 checkpoint
- **WHEN** 저장 완료 checkpoint가 HTTP CSV source가 생성한 묶음의 중간 행을 가리킨다
- **THEN** CLI는 그 묶음에서 이미 확정된 행만 제거하고 남은 행에 checkpoint 이후의 연속된 위치를 부여한다

#### Scenario: 실패 또는 취소된 묶음
- **WHEN** HTTP 다운로드·CSV 파싱·묶음 처리 중 실패하거나 실행이 취소된다
- **THEN** CLI는 기존 공개 실패 또는 취소 결과를 반환하고 마지막 저장 완료 checkpoint 이후의 행을 확정하지 않는다

#### Scenario: 잘못된 HTTP CSV checkpoint
- **WHEN** HTTP CSV 실행이 음수·비정수 또는 숫자가 아닌 checkpoint에서 시작된다
- **THEN** CLI는 원천을 정상 완료한 것으로 처리하지 않고 안정적인 실행 실패 결과를 반환한다
