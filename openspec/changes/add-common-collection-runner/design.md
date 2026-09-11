## Context

동기는 [proposal.md](./proposal.md)를 따른다. 현재 `packages/http-collector`는 묶음 callback이 끝날 때까지 다음 HTTP 요청을 시작하지 않고, `packages/collection-engine`의 `processRecords`는 원천 레코드를 가공·검증해 제한된 `ValidatedBatch`를 consumer에 전달한다. `packages/platform-db`의 `RecordStorage`는 실행 시작·종료, 범위별 checkpoint 조회와 레코드·관계·격리 오류·checkpoint의 원자적 commit을 제공한다.

세 계약은 아직 연결되어 있지 않다. 특히 `processRecords`의 격리 오류는 반환 결과에 모이며, 저장 계약은 checkpoint를 포함한 묶음 단위 commit을 요구한다. runner는 한 collector 묶음을 checkpoint 원자 단위로 취급하고 그 묶음의 가공 결과만 일시 보유한 뒤 한 번에 commit해야 한다.

## Goals / Non-Goals

**Goals:**

- 기존 `collection-engine` 안에 프레임워크·source 방식 비종속 orchestration 경계를 둔다.
- collector 묶음별 checkpoint 원자성과 순차 backpressure를 보장한다.
- 격리 가능한 가공 오류와 실행 전체 실패를 분리한다.
- 전체 실행에 비례하는 결과 누적 없이 처리·성공·격리 집계만 유지한다.

**Non-Goals:**

- CLI, NestJS controller, 스케줄러, queue와 worker 진입점을 추가하지 않는다.
- `RecordStorage` 인터페이스나 DB migration을 변경하지 않는다.
- HTTP offset/single, CSV 등 기존 collector를 이 변경에서 모두 어댑트하지 않는다.
- 재시도, 동시 실행 잠금, 원천 부재 판정과 자동 보관을 구현하지 않는다.

## Decisions

### Runner를 기존 collection-engine에 둔다

`collection-engine`이 이미 transform 로딩·검증·묶음 소비 경계를 소유하므로 여기에 공통 runner와 collector 타입을 추가한다. 별도 `collection-runner` 패키지는 지금 필요한 공개 경계를 늘리면서 대부분의 의존성과 테스트를 `collection-engine`과 공유하므로 제외한다. `http-collector`에 runner를 두는 대안은 CSV와 후속 source가 HTTP 세부 구현에 의존하게 되어 제외한다.

### Collector는 checkpoint를 포함한 push 계약으로 주입한다

collector는 시작 checkpoint, AbortSignal과 비동기 batch handler를 받는다. 각 묶음은 원천 `records`, 수집 시각과 선택적 응답 metadata, 시작·다음 JSON checkpoint를 제공한다. collector는 handler Promise가 끝날 때까지 다음 묶음을 전달하지 않아야 한다. runner는 HTTP URL이나 offset 구조를 해석하지 않고 checkpoint를 opaque JSON으로 다룬다.

AsyncIterable도 같은 순차성을 표현할 수 있지만 기존 HTTP collector가 callback backpressure를 이미 사용하고 `processRecords`도 consumer callback을 제공하므로 첫 조합에서는 callback 계약을 유지한다. 후속 어댑터는 source 고유 checkpoint와 batch를 이 공통 형식으로 변환한다.

### 한 collector 묶음을 하나의 storage commit으로 확정한다

runner는 `processRecords`가 내보내는 제한된 여러 `ValidatedBatch`를 현재 collector 묶음 범위에서만 합치고, 반환된 격리 오류 및 처리 건수와 함께 `commitBatch`를 한 번 호출한다. 이로써 정상 데이터와 오류가 다음 checkpoint와 같은 트랜잭션에서 확정되고, 저장 실패 시 collector 묶음 전체와 checkpoint가 롤백된다.

collector 계약은 한 묶음의 최종 가공 결과가 기존 storage 크기 제한 안에 들어오도록 제한된 입력을 제공해야 한다. 제한을 넘으면 저장 실패로 실행을 중단하며 runner가 묶음을 임의로 나누어 checkpoint를 조기 확정하지 않는다. 원천 페이지보다 작은 재개 단위가 필요한 collector는 후속 어댑터에서 재현 가능한 세부 checkpoint를 제공한다.

### 실행 수명과 집계를 runner가 소유한다

runner는 scope로 checkpoint를 읽고 `startRun`을 호출한 뒤 collector를 실행한다. 각 commit 성공 후 처리·성공·격리 건수만 누적한다. 모든 묶음이 끝나면 격리 건수에 따라 `success` 또는 `partial`로 `finishRun`한다.

collector 시작 전 필요한 transform을 먼저 로드하여 모듈 로딩 실패가 원천 요청이나 batch 저장 뒤에 발견되지 않게 한다. 실행 시작 이후 collector·transform 소비·storage 실패 또는 취소가 발생하면 가능한 경우 `finishRun(status: 'failed')`를 시도한다. 원래 실패를 보존하고 종료 기록 실패는 원인으로 덮어쓰지 않는다.

### 오류는 runner 단계 코드로 정규화한다

공개 runner 오류는 `module_load`, `collection`, `transform_consumer`, `storage`, `cancelled`처럼 단계가 안정된 코드만 노출하고 하위 오류 메시지, 원천 응답, connection과 driver 정보를 복사하지 않는다. 레코드별 transform 문제는 기존 제한된 `TransformIssue`를 `StorageIssue`로 매핑하며 실행 실패로 승격하지 않는다.

AbortSignal은 collector와 `processRecords`에 같은 객체로 전달한다. 각 handler 진입 전, 가공 후 commit 전과 다음 묶음으로 복귀하기 전에 취소를 확인한다. 이미 시작된 DB commit의 물리적 취소는 `RecordStorage` 계약에 없으므로 그 Promise의 완료를 기다리되 취소 후 새 작업은 시작하지 않는다.

### 계약 테스트는 가짜 구현을 우선한다

결정적인 가짜 collector와 in-memory fake storage로 호출 순서, 저장 대기, checkpoint 성공·실패, 부분 성공, fatal 오류, 취소와 source 비종속성을 검증한다. 다수 묶음 테스트는 완료된 레코드·오류 배열을 runner가 보유하지 않고 집계 값만 유지하는지 관찰 가능한 계측으로 확인한다. 기존 transform 및 HTTP collector 테스트와 workspace typecheck·lint를 회귀 검증으로 실행한다.

## Risks / Trade-offs

- [가공 결과가 크게 확장되면 collector 묶음 하나가 storage 제한을 넘을 수 있음] → 묶음을 checkpoint 원자 단위로 제한하고 명시적으로 실패시킨다. 세부 재개 checkpoint와 자동 분할은 실제 collector 어댑터 작업에서 설계한다.
- [실행 실패 후 `finishRun`도 실패할 수 있음] → 최초 안정 오류를 호출자에게 반환하고 종료 기록 실패로 원인을 덮어쓰지 않는다. 운영 복구 정책은 후속 실행 API에서 다룬다.
- [취소 중 진행 중인 storage commit은 즉시 중단되지 않음] → 원자적 commit 결과를 기다리고 이후 묶음을 금지한다. storage 수준 취소는 계약 변경이 필요한 후속 범위로 둔다.
- [기존 `processRecords`가 묶음 내부 격리 오류를 반환 시점까지 보유함] → collector 묶음 크기에만 비례하므로 전체 실행 누적은 피한다. 스트리밍 오류 저장이 필요할 규모가 확인되면 transform 계약을 별도 변경한다.

## Migration Plan

새 공개 타입과 runner 함수는 additive 변경이며 기존 transform·collector·storage 호출 경로를 바꾸지 않는다. 먼저 가짜 구현 계약 테스트와 workspace CI를 통과시킨 뒤 후속 CLI 또는 collector 어댑터가 명시적으로 runner를 사용한다. 롤백은 runner를 사용하는 진입점이 아직 없으므로 추가 파일과 export를 제거하는 것으로 충분하며 DB migration이나 데이터 복구는 필요하지 않다.
