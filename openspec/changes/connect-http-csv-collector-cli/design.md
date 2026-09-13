## Context

제안서의 문제처럼 HTTP CSV source는 제한된 `HttpCsvBatch`를 제공하지만 `apps/collector-cli`의 collector 선택기는 HTTP JSON offset/single과 로컬 CSV만 연결한다. API 기동 수집은 collector CLI 프로세스를 재사용하므로 이 선택기 한 곳의 누락이 수동·기동 실행 모두에 영향을 준다.

collection engine은 `startCheckpoint`가 현재 저장 checkpoint와 일치하는지 확인하고, 묶음 저장과 `nextCheckpoint` 확정을 저장소 경계에서 처리한다. HTTP CSV source는 원천 스트림을 처음부터 읽으며 각 묶음에 `records`와 전체 응답 완료 여부를 제공한다.

## Goals / Non-Goals

**Goals:**

- HTTP CSV 정의를 기존 공통 CLI collector로 변환한다.
- numeric checkpoint를 확정된 CSV 행 수로 사용해 묶음 경계 안팎에서 재개한다.
- source의 backpressure·취소·오류를 보존하면서 collection engine의 저장/checkpoint 계약을 유지한다.
- 수동 CLI와 이를 재사용하는 API 기동 수집을 실제 mock HTTP source와 Docker에서 검증한다.

**Non-Goals:**

- HTTP CSV source의 다운로드·압축·파싱 구현 또는 공개 오류 종류를 바꾸지 않는다.
- 원천이 변경되어 행 순서가 달라지는 경우의 snapshot 안정성을 새로 보장하지 않는다.
- HTTP CSV 전용 저장 경로나 별도 실행 코어를 만들지 않는다.

## Decisions

### collector CLI가 HTTP CSV source를 직접 의존한다

`@oss-scp/http-csv-source`를 collector CLI의 workspace runtime dependency와 prebuild 순서에 추가한다. 플러그인 작업자가 `source.json`에 선언한 transport와 format은 `plugin-config`가 검증된 정의로 변환하며, 기존 `collectorFor()`가 이 HTTP CSV 정의를 판별해 source를 자동 호출한다. CLI 사용자는 collector 종류를 지정하지 않고 plugin ID만 제공하므로 수동 실행과 API 기동 실행이 같은 경로를 유지한다.

대안으로 API 기동 계층에 HTTP CSV 전용 분기를 둘 수 있지만 수동 실행과 동작이 갈라지고 공통 코어 재사용 요구를 깨므로 선택하지 않는다. 모든 source를 새 범용 adapter registry로 재구성하는 방안도 현재 한 분기 누락을 해결하기에는 범위가 크다.

### checkpoint를 전달 완료 행의 절대 위치로 계산한다

collector는 입력 checkpoint를 0 이상의 안전한 정수로 검증하고 `consumed`로 사용한다. HTTP CSV source의 각 묶음을 처음부터 순회하면서 절대 `position`을 계산하고, 묶음 전체가 checkpoint 이전이면 건너뛴다. checkpoint가 묶음 내부이면 앞부분만 잘라 남은 records를 전달한다.

전달 묶음의 `startCheckpoint`는 첫 묶음에서 저장소가 제공한 원래 checkpoint를 보존하고 이후에는 직전 `nextCheckpoint`를 사용한다. `nextCheckpoint`는 전달 후 누적 확정 후보 행 수이며, `responseMetadata.complete`는 source 묶음의 값을 그대로 전달한다. source 단계에서 행을 건너뛰도록 새 API를 추가하는 대안은 네트워크 다운로드를 줄이지 못하면서 기존 source 계약만 넓히므로 사용하지 않는다.

### 오류 정규화는 기존 CLI 경계를 유지한다

HTTP CSV source 오류는 collector 밖으로 전파하고 `executeManualCollection()`의 기존 정규화가 `collection_failed` 또는 `cancelled` 공개 결과로 변환한다. `onBatch`가 성공한 뒤에만 collection engine이 checkpoint를 저장하므로 실패한 묶음의 후보 checkpoint는 확정되지 않는다. source의 상세 오류나 URL query를 새 로그 필드로 노출하지 않는다.

### 실제 실행 검증은 기존 테스트 층에 추가한다

collector 단위 테스트는 여러 묶음, 묶음 내부 checkpoint, 완료 metadata와 취소/실패 전파를 검증한다. Docker 검증은 mock profile을 실행한 환경에서 HTTP CSV CLI 성공과 API 기동 수집 상태를 확인해 이미지 패키징 및 runtime dependency 누락도 함께 잡는다. 별도 HTTP CSV 전용 저장 구현은 만들지 않는다.

## Risks / Trade-offs

- [원천 CSV가 실행 사이에 재정렬되면 행 번호 checkpoint로 중복 또는 누락이 생길 수 있음] → 현재 전체 CSV source의 순서 안정성 제약을 문서화하고, 이 변경에서는 기존 numeric checkpoint 계약만 적용한다.
- [재개 시에도 응답 처음부터 파싱하므로 네트워크 비용은 줄지 않음] → 메모리는 제한된 묶음으로 유지하고 확정 행의 재가공·저장을 피한다. 원격 range 또는 원천 cursor는 source별 후속 계약으로 둔다.
- [HTTP CSV dependency가 API 이미지에 누락될 수 있음] → collector CLI package 의존성·prebuild와 Docker 실제 CLI 검증을 함께 갱신한다.

## Migration Plan

DB migration과 설정 schema 변경은 없다. 새 collector CLI를 포함한 API 이미지를 배포하면 기존 `vulnerabilities-http-csv` 설정이 그대로 실행된다. 문제가 있으면 이전 이미지로 되돌릴 수 있으며 기존 저장 데이터와 checkpoint 형식은 변경되지 않는다.
