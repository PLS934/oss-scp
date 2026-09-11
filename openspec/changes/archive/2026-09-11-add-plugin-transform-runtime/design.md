## Context

동기는 [proposal.md](proposal.md)를 따른다. 현재 `packages/plugin-config`는 `plugin.json`의 최소 식별 정보와 source를 검증해 HTTP 수집 정의로 해석하지만 데이터 정의나 가공 모듈은 다루지 않는다. sample1·sample2 설정 작업과 offset 수집 작업이 같은 작업 트리에 진행 중이므로 기존 source 변형을 깨뜨리지 않고 가공 정보를 공통 내부 정의에 덧붙여야 한다.

운영 플러그인은 Git PR로 검토되어 플랫폼과 함께 빌드되는 신뢰 코드다. Node.js 24 LTS와 pnpm workspace를 사용하며 런타임 외부 코드 설치, DB 연결과 NestJS 의존 없이 CLI와 후속 worker에서 재사용할 수 있어야 한다.

## Goals / Non-Goals

**Goals:**

- 배포 전 가공 경로와 데이터 정의를 검증하고 실행 가능한 내부 정의를 만든다.
- 레코드 단위 가공, 결과 검증, 격리 오류와 `partial` 상태를 DB 비종속 계약으로 제공한다.
- sample1·sample2와 CSV 샘플로 기본 매핑, 중첩 값, 응답 metadata와 문자열 업무 타입 변환을 실행한다.
- 저장 소비자의 backpressure를 존중하고 전체 결과 누적을 피한다.

**Non-Goals:**

- PostgreSQL·MySQL 저장과 checkpoint 영속화
- 외부 사용자가 업로드한 비신뢰 코드 실행
- worker thread·프로세스 sandbox와 동기 무한 루프 강제 종료
- transform hot reload, 자동 재가공, 운영 오류 UI

## Decisions

### 빌드된 JavaScript를 동적 import한다

`plugin.json`의 `transform`은 플러그인 디렉터리 안의 런타임 `.js` 파일을 가리킨다. 설정 로더가 기존 `safeResolve` 규칙으로 절대 경로와 상위 경로 이탈을 거부하고 파일 존재·확장자를 확인한다. 실행 로더는 절대 경로를 `pathToFileURL()`로 변환해 `import()`하고 `transform` export가 함수인지 확인한 뒤 경로별 Promise를 캐시한다.

TypeScript 예제는 workspace 빌드가 JavaScript로 변환한다. 런타임 transpile을 선택하지 않은 이유는 운영 이미지의 도구와 의존성을 줄이고 빌드 실패를 배포 전에 드러내기 위해서다. worker thread 대안은 강한 격리를 제공하지만 직렬화·수명주기와 강제 종료 계약이 현재 첫 샘플 범위를 크게 넘으므로 후속으로 둔다.

### 플러그인 설정과 실행 코어를 분리한다

`packages/plugin-config`는 JSON Schema와 교차 참조를 검증하고 source·transform·data를 포함하는 내부 정의를 반환한다. 별도 `packages/plugin-sdk`는 플러그인 작성자가 import할 타입만 제공하며 런타임 의존성을 갖지 않는다. 별도 `packages/collection-engine`은 모듈 로딩, 호출, 결과 검증과 소비자 전달을 담당한다.

설정과 실행을 한 패키지에 넣는 대안은 초기 파일 수는 줄지만 플러그인 빌드용 공개 타입, 파일 I/O와 실행 상태가 결합된다. 세 경계를 나누면 NestJS·DB와 무관하게 CLI와 worker가 재사용할 수 있고 각 계약을 독립 테스트할 수 있다.

### 원천 레코드마다 transform을 순차 호출한다

입력은 `record`, `pluginId`, `sourceId`, `collectedAt`, 제한된 `responseMetadata`, `AbortSignal`이다. 출력은 `{ records, relations? }`이며 한 입력에서 여러 데이터 종류와 관계를 만들 수 있다. 실행기는 한 원천 레코드의 가공과 검증을 끝낸 다음 다음 레코드로 이동한다.

묶음 단위 호출 대안은 묶음 간 계산에 편리하지만 가공 예외가 어느 원천에서 발생했는지 안전하게 격리하기 어렵다. 레코드 단위 순차 호출은 오류 귀속과 backpressure가 명확하고 첫 구현에 필요한 메모리 상한을 단순하게 만든다.

### 선언 기반 재귀 검증을 컴파일해 재사용한다

`plugin.json`은 데이터 종류별 `uniqueKey`와 `fields`, 선택적 `relations`를 가진다. 필드는 `required`와 `string|number|boolean|datetime|object|array` 중 타입을 선언하며 object는 `fields`, array는 `items`를 재귀적으로 선언한다. 설정 단계에서 각 데이터 종류의 검증기를 한 번 생성해 레코드마다 재사용한다. datetime은 유효한 ISO 8601 문자열인지 별도 format 검사한다.

알 수 없는 필드는 오류로 거부한다. 이를 보존하는 대안은 원천 데이터의 우발적 유입과 화면·저장 계약 불일치를 숨길 수 있다. 필요한 원본 조각은 명시적인 object 필드로 선언해야 한다.

첫 구현의 절대 상한은 원천 레코드 한 건당 출력 레코드 100개, 관계 200개, 중첩 깊이 8, 배열 요소 1,000개, 결과 JSON 1 MiB로 둔다. 세 샘플보다 충분히 크면서 악성 또는 실수로 생성된 출력을 제한한다. 이후 실제 연동 근거가 생기면 버전이 있는 계약으로 조정한다.

### 세 입력 형식은 같은 가공 경계로 정규화한다

수집 계층은 offset JSON, single JSON과 CSV를 공통 원천 레코드와 제한된 metadata 계약으로 전달한다. 가공 엔진은 수집 방식에 따른 분기를 갖지 않고 플러그인 정의와 가공 함수만 사용한다. sample1은 기본 필드 매핑과 타입 검증, sample2는 중첩 객체·객체 배열 및 허용된 최상위 응답 metadata, CSV는 문자열에서 number·boolean·datetime으로의 명시적 변환을 대표한다.

sample2의 실제 single HTTP 수집은 #35, HTTP CSV 다운로드는 #24의 범위다. 두 HTTP 실행기를 #41의 선행 조건으로 만들지 않으며 sample2 JSON fixture와 로컬 CSV 입력으로 가공 계약을 검증한다. CSV 파서는 문자열을 유지하고 업무 타입 변환은 CSV 플러그인의 가공 코드만 수행한다.

수집 방식별 가공 어댑터를 두는 대안은 중복 로직과 서로 다른 검증 의미를 만들 수 있어 사용하지 않는다. source 계약이 허용한 레코드 밖 metadata만 공통 문맥으로 전달하며 가공 함수에 원본 HTTP 응답 전체를 노출하지 않는다.

### 원천 호출 단위 원자성과 부분 완료를 함께 제공한다

가공 예외나 결과 하나의 검증 실패가 발생하면 같은 원천 호출에서 생성된 레코드와 관계를 모두 제외한다. 나머지 원천 레코드는 계속 처리하고 격리 오류가 하나 이상이면 `partial`, 없으면 `success`를 반환한다. 모듈 로딩·정의 오류, 취소와 소비자 실패는 전체 처리를 중단한다.

유효 출력만 부분 채택하는 대안은 관계가 끊기거나 한 원천의 파생 데이터 일부만 갱신되는 문제를 만든다. 묶음 전체 실패 대안은 한 건의 원천 오류로 정상 데이터가 지연된다. 원천 호출 단위 원자성이 두 문제 사이의 경계를 가장 명확하게 한다.

중복 유일키 범위는 한 `processBatch` 호출 안의 `(pluginId, sourceId, dataType, key)`다. 재수집과 이미 저장된 키의 갱신 판단은 #29 저장 계약이 맡는다. 관계 끝점은 현재 원천 호출의 출력 또는 같은 처리 묶음에서 앞서 검증된 출력 키를 참조할 수 있다.

### 저장 소비자 콜백으로 경계를 고정한다

`collection-engine`은 검증 완료 출력을 설정 가능한 최대 개수 이하로 모아 `consume(batch)` 비동기 콜백에 전달하고 완료를 기다린다. 첫 구현의 기본 전달 상한은 레코드 100개 또는 직렬화 1 MiB 중 먼저 도달하는 값이다. 소비자가 실패하면 다음 처리를 중단한다.

AsyncIterable 출력 대안도 가능하지만 #29가 데이터와 checkpoint를 같은 트랜잭션으로 확정해야 하므로 완료 여부가 명시적인 소비자 콜백이 첫 연결에서 더 단순하다. 후속 저장 계약은 이 콜백을 구현하고 성공 후에만 checkpoint를 확정한다.

### 오류 정보는 제한된 구조로 반환한다

격리 오류는 플러그인 ID, 원천 순번, 오류 코드, 결과 경로와 비민감 메시지를 포함한다. 가공 함수가 던진 임의 오류 메시지는 그대로 노출하지 않고 허용된 코드와 일반화한 메시지로 변환한다. 원천 레코드 전체, stack, Connection과 response metadata 전체는 공개 결과에 넣지 않는다.

안전한 식별 힌트는 가공 결과의 선언된 유일키가 문자열 또는 숫자로 검증된 경우에만 길이를 제한해 포함한다. 원천 객체에서 임의 ID 필드를 추측하지 않는다.

## Risks / Trade-offs

- [같은 프로세스의 플러그인이 Node.js API에 접근하거나 동기 무한 루프를 실행할 수 있음] → Git 승인 코드만 실행한다는 신뢰 경계를 문서화하고 강제 격리는 후속 worker 실행기로 분리한다.
- [현재 진행 중인 source 계약 변경과 충돌 가능] → 기존 `CollectionDefinition`의 source별 union은 유지하고 공통 plugin transform/data 정보를 교차 필드로 추가하며 offset·single 회귀 테스트를 함께 실행한다.
- [재귀 스키마와 JSON 크기 계산 비용] → 데이터 정의별 검증기를 한 번 생성하고 원천 레코드별 출력 상한을 먼저 검사한다.
- [부분 완료에서 누락 데이터가 정상 결과처럼 보일 수 있음] → 격리 건수와 구조화 오류를 반드시 반환하고 `partial`을 `success`와 구분한다.
- [관계가 뒤쪽 원천 레코드를 참조할 수 없음] → 첫 구현은 현재 또는 앞선 결과 참조만 허용한다. 순서 독립 관계가 필요한 연동은 안정된 외부 키를 저장 계층이 해석하는 후속 계약으로 확장한다.

## Migration Plan

1. plugin JSON Schema와 타입을 확장하되 진행 중인 샘플 플러그인을 같은 변경에서 새 필수 계약으로 갱신한다.
2. 공개 SDK와 collection-engine을 workspace에 추가하고 단위 테스트를 통과시킨다.
3. sample1·sample2와 CSV 샘플 플러그인을 새 필수 `transform`·`data` 계약으로 함께 갱신하고 가공 모듈을 빌드한다.
4. sample1·sample2 fixture와 로컬 CSV 입력으로 외부 자격증명 없는 공통 가공 통합 검증을 연결한다.
5. 기존 플러그인 설정, mock API, 로컬·Docker 검증을 실행한다.

롤백은 새 패키지와 plugin schema/data/transform 변경을 함께 되돌린다. 아직 DB에 저장하지 않으므로 데이터 migration이나 복구는 필요하지 않다.
