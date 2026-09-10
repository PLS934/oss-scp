## Context

현재 `packages/plugin-config`는 HTTP JSON offset과 로컬 CSV file source를 검증해 형식별 `CollectionDefinition`을 반환한다. mock API의 `/sample2`는 `{ items, test_field6 }` 형태의 전체 응답을 제공한다. 기존 CSV 계약을 유지하면서 두 HTTP 샘플의 Connection 이름과 포트를 대칭화하며, 동기와 변경 범위는 `proposal.md`를 따른다.

## Goals / Non-Goals

**Goals:**

- sample1 파일과 offset 출력의 하위 호환성을 유지한다.
- 로컬 CSV source의 설정·출력·실행 경계를 유지한다.
- 동일한 source schema와 로더에서 offset과 single을 명확히 판별한다.
- sample2를 sample1과 같은 플러그인 구조와 Connection 참조 방식으로 등록한다.
- 후속 HTTP 실행기가 방식별 필드의 존재 여부를 타입 안전하게 처리할 수 있는 내부 정의를 제공한다.

**Non-Goals:**

- 설정 검증 중 sample2 파일을 읽거나 응답 건수·업무 필드·중첩 구조를 검사하지 않는다.
- 실제 HTTP 요청과 원천 응답 추출·가공 방식을 구현하지 않는다.
- single 응답 전체의 메모리·바이트 제한과 실행 오류 정책을 미리 결정하지 않는다.

## Decisions

### pagination을 판별 가능한 union으로 확장한다

공개 source와 내부 수집 정의의 `pagination.type`을 판별자로 사용한다. offset은 현재 필드를 모두 유지하고 single은 `{ "type": "single" }`만 허용한다. 내부 `response.totalPath`는 offset 변형에만 존재하게 해 후속 실행기가 single에 전체 건수 경로가 있다고 오인하지 않게 한다.

single 전체 source schema를 만드는 대안은 공통 요청·Connection 검증을 중복시킨다. `pagination`을 선택 속성으로 없애는 대안은 pagination 누락과 의도적인 single 선언을 구분하지 못하므로 사용하지 않는다.

공통 source schema와 loader는 공통 필드 검증 및 타입 dispatch만 담당한다. offset·single 전용 pagination schema는 `source-offset.schema.json`·`source-single.schema.json`으로, 내부 정의 변환은 `source-loaders/file.ts`·`offset.ts`·`single.ts`로 분리한다. 이 구조는 공통 plugin/source/Connection 참조 처리를 중복하지 않으면서 타입별 필드와 변환 로직을 독립시킨다.

### sample2는 독립 mock Connection과 포트를 사용한다

`plugins/sample2-single-api`에 sample1과 같은 최소 `plugin.json`과 `source.json`을 두고 `plugins/registry.json`에 추가한다. sample1 source의 Connection 참조는 `mock-api-sample1`, sample2 source의 참조는 `mock-api-sample2`로 대칭화한다. `connections/mock-api-sample1.json`은 `http://127.0.0.1:3001`, `connections/mock-api-sample2.json`은 `http://127.0.0.1:3002`를 제공한다. 기존 `connections/mock-api.json`은 이름이 겹치지 않도록 `mock-api-sample1.json`로 대체한다.

하나의 Connection에서 경로만 나누는 방식은 데이터 구조와 pagination 차이는 검증하지만 서로 다른 API 주소를 플러그인별로 결합하는 확장 계약을 검증하지 못하므로 사용하지 않는다. 직접 검증에서는 기존 mock API 프로그램을 `MOCK_PORT=3002`로 한 번 더 실행한다. 두 프로세스가 같은 fixture를 제공하더라도 Connection·프로세스·포트가 분리되어 한 API의 주소 변경이나 중단이 다른 정의에 영향을 주지 않는지 확인할 수 있다.

### 원천 응답 구조 보존은 실행 경계의 요구사항으로만 명시한다

현재 설정 로더는 네트워크 응답을 다루지 않으므로 `test_field2`, `test_field3`, `test_field6`을 schema나 내부 정의에 업무 필드로 추가하지 않는다. 대신 `itemsPath`는 목록 위치만 지정하고, 후속 수집·가공 경계가 목록 항목과 최상위 응답 문맥을 보존해야 한다는 계약을 명시한다. 이 선택은 sample2 필드를 코어에 고정하지 않으면서 #35 구현에 필요한 조건을 남긴다.

### 기존 검증 명령과 CI 경로를 확장한다

현재 Vitest 단위 테스트와 설정 검증 프로세스 테스트가 저장소 등록 목록 전체를 읽으므로 별도 CI job을 추가하지 않는다. 정상 기대값을 서로 다른 Connection/base URL의 두 정의로 확장하고 single 전용 오류, Connection 독립 변경 및 다른 경로·목록 위치의 정상 fixture를 추가해 일반성을 검증한다.

## Risks / Trade-offs

- [내부 타입 변경이 후속 offset 수집기 작업과 충돌할 수 있음] → 판별 가능한 union으로 방식별 필드를 좁힐 수 있게 하고 sample1 기대 출력을 회귀 테스트로 고정한다.
- [원천 응답 보존 요구사항을 이번 설정 로더만으로 실행 검증할 수 없음] → 이번 테스트는 필드가 schema·코어 상수에 들어가지 않음을 확인하고, 실제 전달 검증은 #35의 single HTTP 실행 테스트에서 수행한다.
- [single 응답에 전체 건수 정보가 없으면 실행 결과 건수를 별도 계산해야 함] → 이번 정의에는 `totalPath`를 만들지 않고 후속 실행기가 추출한 목록 길이로 처리할지 별도 실행 계약에서 정한다.
- [같은 mock 프로그램을 두 포트로 실행하므로 실제 타사 API 차이를 모두 재현하지 못함] → 이번 변경은 Connection 독립성과 응답 계약 차이를 검증하고, 실제 수집처별 인증·장애 차이는 후속 connector 통합에서 검증한다.

## Migration Plan

source-v1의 기존 offset과 로컬 CSV 변형은 그대로 유효하다. schema와 로더를 먼저 확장한 뒤 sample1 Connection을 `mock-api-sample1`로 이름 변경하고 sample2 플러그인과 `mock-api-sample2` Connection을 등록한다. 롤백은 sample2 등록·Connection·파일을 제거하고 sample1 Connection 이름과 참조를 `mock-api`로 복구한 뒤 single 변형 지원을 되돌린다. 데이터 migration은 없다.
