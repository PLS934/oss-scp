## Context

현재 `plugin-config`는 `oss-scp/source-v1`의 HTTP JSON offset 구조만 검증해 단일 형태의 `CollectionDefinition`을 만든다. `csv-reader`는 파일 전체를 버퍼링하지 않고 UTF-8 CSV를 행 객체로 순회하며 파일 변경과 입력 한도를 검사하지만, 플러그인 설정이나 묶음 실행 계약은 알지 못한다. 요구 배경은 `proposal.md`, 관찰 가능한 계약은 두 delta spec을 따른다.

## Goals / Non-Goals

**Goals:**

- 기존 JSON offset 정의를 깨지 않는 판별 union source/collection 정의를 만든다.
- 설정 루트 안의 파일만 열고 공통 CSV 파서를 변경 없이 재사용한다.
- 행 묶음의 backpressure, 마지막 완료 표시, 취소 시 자원 해제를 검증한다.
- 샘플 플러그인이 실제 fixture를 53행·6필드로 전달하는 통합 경로를 제공한다.

**Non-Goals:**

- 가공 코드 실행, DB 저장과 checkpoint 영속화, 자산 부재 판정은 연결하지 않는다.
- 브라우저 업로드와 HTTP CSV 다운로드, 임의 구분자·비 UTF-8 인코딩은 지원하지 않는다.
- 실행 환경 밖 절대 경로를 Git 설정으로 허용하는 별도 Connection 계약은 만들지 않는다.

## Decisions

### source schema를 형식별 `oneOf`로 확장한다

`format: "json"`인 기존 HTTP offset 구조와 `format: "csv"`, `transport: "file"`인 로컬 구조를 판별 가능한 union으로 정의한다. 로컬 구조는 `path`, `batchSize`, 선택적인 `maxBytes`, `maxRecordSize`만 허용한다. 기존 schema/version을 유지해 sample1 파일을 수정하지 않으며 각 분기에서 `additionalProperties: false`로 HTTP와 파일 속성 혼용을 차단한다.

별도 source-v2는 기존 계약을 불필요하게 폐기하고, 모든 속성을 선택적으로 둔 단일 객체는 잘못된 조합을 타입과 schema에서 놓치므로 선택하지 않는다.

### 파일 경로는 저장소 설정 루트 기준 상대 경로로 해석한다

검증기는 source의 `path`를 설정 루트 기준으로 정규화하고 그 경계 밖의 절대·상위 경로를 거부한다. 내부 정의에는 검증된 절대 경로를 담아 실행기가 다시 임의 기준으로 해석하지 않게 한다. 샘플은 `fixtures/csv/vulnerabilities.csv`를 직접 참조하며 Connection은 사용하지 않는다.

환경별 임의 호스트 경로나 비밀이 없는 로컬 fixture에 HTTP Connection을 재사용하는 것은 책임이 맞지 않고 파일 접근 범위를 넓히므로 제외한다. 운영 배포는 허용 루트 안으로 파일을 마운트해야 하며, 외부 파일 root/Connection이 필요해지면 별도 계약으로 추가한다.

### CSV source 실행은 작은 전용 패키지에서 행 묶음으로 노출한다

새 workspace 패키지는 `plugin-config`의 로컬 CSV 내부 정의와 `csv-reader`의 `readCsvFile`을 조합한다. async iterable은 `records`와 `complete`를 가진 묶음을 내보내며, 한 묶음 크기만 버퍼링하고 한 행 lookahead로 마지막 묶음에만 `complete: true`를 표시한다. 헤더만 있는 정상 파일도 빈 완료 묶음을 한 번 반환한다.

설정 로딩과 실행을 `plugin-config`에 함께 넣으면 검증 패키지가 I/O 실행과 CSV 의존성을 떠안고, CSV 파서에 batching을 넣으면 향후 HTTP 다운로드도 같은 파서 위에서 서로 다른 실행 정책을 쓰기 어려워지므로 분리한다.

### 취소는 실행 경계에서 표준 AbortSignal로 처리한다

실행기는 읽기 시작 전과 각 행/묶음 경계에서 신호를 확인하고 전용 취소 오류를 던진다. generator 종료는 하위 CSV iterator의 `return()`을 호출해 기존 `finally` 자원 정리를 실행한다. 파서의 원인별 오류 코드는 그대로 보존하며 취소만 별도 코드로 구분한다.

`csv-reader` 공개 API 전체에 signal을 추가하는 대안은 다운로드 스트림까지 포함한 공통 취소 설계가 확정되기 전 파서 책임을 넓히므로 이번 범위에서 사용하지 않는다.

## Risks / Trade-offs

- [취소 확인이 파일 read syscall 도중 즉시 선점하지 못함] → 작은 스트림 chunk와 행 경계에서 빠르게 종료하고 테스트에서 조기 자원 해제를 확인한다.
- [한 행 lookahead가 마지막 행 하나를 추가 보관함] → 완료 플래그의 정확성을 위해 허용하되 메모리는 묶음 크기와 최대 레코드 크기로 제한한다.
- [설정 루트 제한이 외부 운영 파일을 직접 가리키지 못함] → 현재 샘플/CI의 안전한 기본값으로 고정하고 운영 파일 위치 계약은 실제 요구와 mount 방식을 확인한 후 별도 변경으로 설계한다.
- [복수 collection definition으로 기존 출력 스냅샷이 변경됨] → sample1 항목의 값·형태 유지와 새 CSV 항목의 추가를 각각 검증한다.

## Migration Plan

기존 JSON offset 설정은 변경 없이 유효하다. schema와 판별 union을 배포한 뒤 CSV 샘플 플러그인을 registry에 추가한다. 롤백 시 CSV 등록과 새 실행 패키지를 함께 제거하면 기존 sample1 검증 경로로 돌아가며 영속 데이터 변경은 없다.
