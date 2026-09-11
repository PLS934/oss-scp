# common-collection-runner Specification

## Purpose

수집 방식과 실행 진입점에 독립적으로 원천 묶음을 가공하고 공통 저장 계약에 확정하여, 안전한 재개·부분 성공·backpressure를 일관되게 제공한다.

## Requirements

### Requirement: Runner composes collection, transformation, and storage
공통 collection runner는 검증된 플러그인 정의, collector, transform과 `RecordStorage`를 조합하여 저장된 checkpoint부터 원천 묶음을 순서대로 SHALL 처리해야 한다. 특정 플러그인 ID, 데이터 필드, source 방식 또는 예상 원천 건수를 고정해서는 안 된다.

#### Scenario: Collection starts from the stored checkpoint
- **WHEN** 실행 범위에 저장된 checkpoint가 있는 상태로 수집을 시작한다
- **THEN** runner는 그 checkpoint를 collector에 전달하고 원천 묶음을 가공한 뒤 기존 `RecordStorage` 계약으로 저장한다

#### Scenario: A different collector uses the same runner
- **WHEN** HTTP offset 방식이 아닌 공통 collector 계약 구현을 연결한다
- **THEN** runner는 source 방식별 분기나 샘플 전용 필드 없이 같은 수집·가공·저장 흐름을 실행한다

### Requirement: Each source batch is persisted atomically with its checkpoint
runner는 원천 묶음의 정상 레코드, 관계, 격리 오류와 다음 checkpoint를 하나의 저장 묶음으로 SHALL 전달해야 하며, 저장 성공 후에만 다음 원천 묶음을 처리해야 한다.

#### Scenario: Successful persistence advances collection
- **WHEN** 한 원천 묶음의 가공 결과와 다음 checkpoint 저장이 완료된다
- **THEN** runner는 저장 완료를 기다린 후 다음 원천 묶음 처리를 허용한다

#### Scenario: Persistence failure preserves the previous checkpoint
- **WHEN** 원천 묶음 저장이 실패한다
- **THEN** runner는 후속 원천 묶음의 요청·가공·저장을 시작하지 않고 기존 checkpoint가 유지되도록 실행을 실패 처리한다

### Requirement: Isolated transform errors produce a partial run
runner는 가공·검증 과정에서 격리 가능한 원천 레코드 오류를 정상 결과와 함께 SHALL 저장하고, 하나 이상의 격리 오류가 기록된 완료 실행을 `partial`로 SHALL 종료해야 한다.

#### Scenario: Valid and invalid source records share a batch
- **WHEN** 한 원천 묶음에서 일부 레코드만 가공 또는 검증에 실패한다
- **THEN** runner는 정상 레코드와 제한된 오류 정보를 같은 checkpoint 저장 단위에 기록하고 남은 원천 묶음을 계속 처리한다

#### Scenario: Run completes without isolated errors
- **WHEN** 모든 원천 묶음이 격리 오류 없이 저장된다
- **THEN** runner는 누적 처리·성공·격리 건수와 함께 실행을 `success`로 종료한다

### Requirement: Fatal errors and cancellation stop further work
runner는 설정·모듈 로딩·수집·저장 실패와 취소를 비밀정보나 원천 데이터가 포함되지 않은 안정적인 오류로 SHALL 구분하고, 실패 또는 취소가 관측된 이후 새 요청·가공·저장을 시작해서는 안 된다. 시작된 실행은 종료 가능한 경우 `failed`로 기록해야 한다.

#### Scenario: Collector fails
- **WHEN** collector가 원천 묶음을 전달하기 전이나 처리 중 실패한다
- **THEN** runner는 실행을 `failed`로 종료하고 collector의 비밀정보나 원천 응답을 공개 오류에 포함하지 않는다

#### Scenario: Transform module cannot be loaded
- **WHEN** 플러그인 transform 모듈을 불러올 수 없다
- **THEN** runner는 저장 묶음을 만들지 않고 실행을 `failed`로 종료한다

#### Scenario: Collection is cancelled
- **WHEN** 수집·가공·저장 경계에서 AbortSignal 취소를 관측한다
- **THEN** runner는 취소 이후 후속 작업을 시작하지 않고 안정적인 취소 오류를 반환하며 시작된 실행을 `failed`로 종료한다

### Requirement: Runner applies backpressure and bounded accumulation
runner는 한 원천 묶음의 저장 consumer가 완료될 때까지 collector의 다음 묶음 처리를 SHALL 지연하고, 완료된 묶음이나 전체 실행 결과를 메모리에 누적해서는 안 된다.

#### Scenario: Storage consumer is slow
- **WHEN** storage가 한 묶음의 commit 완료를 지연한다
- **THEN** collector는 해당 commit이 완료되기 전에 다음 묶음 handler 완료를 관측하지 못한다

#### Scenario: Many batches are collected
- **WHEN** 제한된 크기의 원천 묶음이 다수 전달된다
- **THEN** runner의 메모리 보유량은 전체 실행 건수가 아니라 현재 처리 중인 원천 묶음 크기에 의해 제한된다
