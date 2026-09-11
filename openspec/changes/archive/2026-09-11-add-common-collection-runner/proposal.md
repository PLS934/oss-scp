## Why

HTTP collector, 플러그인 가공 실행기와 `RecordStorage`는 각각 존재하지만 이를 checkpoint 기반의 한 실행으로 조합하는 공통 경로가 없다. CLI와 후속 worker가 같은 코어를 재사용하고 저장 성공 이전에 checkpoint가 앞서가지 않도록 프레임워크·수집 방식에 독립적인 collection runner가 필요하다.

## What Changes

- 검증된 플러그인 정의, 범용 collector, transform과 `RecordStorage`를 조합하는 공통 collection runner를 추가한다.
- 저장된 checkpoint에서 실행을 시작하고 원천 묶음을 수집→가공·검증→저장 순서로 직렬 처리한다.
- 정상 레코드와 가공 격리 오류를 같은 저장 묶음에 기록하고 최종 실행 상태를 `success` 또는 `partial`로 집계한다.
- 모듈 로딩·수집·저장 실패와 취소를 안정적인 runner 오류로 구분하고 후속 처리를 중단한다.
- 저장 consumer 완료를 기다린 뒤 다음 묶음을 요청하여 backpressure를 유지하고 전체 결과를 메모리에 누적하지 않는다.
- 가짜 collector와 storage를 이용한 단위·메모리·회귀 테스트 및 공통 실행 경계 문서를 추가한다.
- 수동 CLI, NestJS 실행 API, 스케줄러·Redis·worker, single JSON·CSV collector 구현과 브라우저 화면은 제외한다.

## Capabilities

### New Capabilities

- `common-collection-runner`: collector·transform·공통 저장 계약을 checkpoint 기반 실행으로 조합하는 순서, backpressure, 부분 성공, 실패 및 취소 동작을 정의한다.

### Modified Capabilities

없음.

## Impact

- `packages/collection-engine`: 범용 collector 및 runner 공개 계약, orchestration 구현과 테스트가 추가된다.
- `packages/platform-db`: 기존 `RecordStorage` 공개 타입을 runner가 소비하며 저장 계약이나 DB schema는 변경하지 않는다.
- `packages/http-collector`: 기존 구현을 바꾸지 않고 후속 어댑터가 연결할 수 있는 경계를 문서화한다.
- workspace CI와 개발 문서에 collection runner 검증 명령 및 실행 경계가 추가된다.
