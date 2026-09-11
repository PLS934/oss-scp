## 1. Runner 공개 계약과 오류 경계

- [x] 1.1 `collection-engine`에 opaque JSON checkpoint, 제한된 원천 묶음, 비동기 handler와 AbortSignal을 사용하는 범용 collector 타입을 추가하고 TypeScript 타입 검사로 HTTP·샘플 필드 의존성이 없음을 검증한다.
- [x] 1.2 실행 입력·결과와 `module_load`·`collection`·`transform_consumer`·`storage`·`cancelled` 단계의 안정적인 runner 오류를 정의하고 오류 메시지에 하위 원문·비밀정보가 노출되지 않는 단위 테스트를 통과시킨다.
- [x] 1.3 `collection-engine`이 기존 `RecordStorage` 계약을 타입으로 소비하도록 workspace 의존성을 연결하고 전체 workspace 설치·빌드에서 순환 의존성이 없음을 검증한다.

## 2. 공통 수집 실행 구현

- [x] 2.1 저장 checkpoint 조회와 실행 시작·종료 수명을 구현하고 저장된 checkpoint가 collector에 전달되며 정상 완료가 `success`로 기록되는 테스트를 통과시킨다.
- [x] 2.2 collector 묶음별로 기존 `processRecords`를 실행하고 현재 묶음의 레코드·관계·격리 오류·건수를 한 번의 `commitBatch`에 매핑하여 checkpoint와 원자적으로 저장되는 테스트를 통과시킨다.
- [x] 2.3 격리 오류가 있는 묶음은 정상 레코드와 함께 저장하고 전체 실행을 계속한 뒤 `partial`과 누적 처리·성공·격리 건수를 반환하는 테스트를 통과시킨다.
- [x] 2.4 commit 완료 전 handler를 완료하지 않고 다음 묶음을 처리하지 않는 backpressure를 구현하며 지연 가능한 fake storage로 호출 순서를 검증한다.

## 3. 실패·취소·재개 검증

- [x] 3.1 모듈 로딩·collector·transform consumer·storage 실패가 후속 요청·가공·저장을 중단하고 시작된 실행을 가능한 경우 `failed`로 종료하는 회귀 테스트를 추가한다.
- [x] 3.2 저장 실패 시 다음 checkpoint가 확정되지 않고 같은 시작 checkpoint로 재실행할 수 있는 fake storage 테스트를 통과시킨다.
- [x] 3.3 수집·가공 후 commit 전·진행 중인 commit 완료 후 경계에서 취소를 검증하여 취소 이후 새 작업이 시작되지 않고 안정적인 `cancelled` 오류가 반환되는 테스트를 통과시킨다.
- [x] 3.4 offset과 무관한 가짜 collector를 같은 runner에 연결해 특정 source 방식·플러그인 ID·필드·원천 건수에 종속되지 않음을 검증한다.

## 4. 메모리·문서·통합 검증

- [x] 4.1 다수의 제한된 묶음을 처리할 때 runner가 완료된 레코드·오류 배열을 보유하지 않고 현재 묶음과 숫자 집계만 유지하는 메모리 회귀 테스트를 추가한다.
- [x] 4.2 공통 runner 입력·처리 순서·checkpoint 원자 단위·오류/취소·묶음 크기 책임과 CLI/API/worker 후속 연결 경계를 문서화하고 문서 예제가 공개 타입과 일치하는지 확인한다.
- [x] 4.3 변경 패키지 단위 테스트와 build/typecheck, workspace lint·test를 실행하고 OpenSpec strict 검증을 통과시킨다.
