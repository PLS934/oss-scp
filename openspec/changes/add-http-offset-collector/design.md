## Context

#19의 `packages/plugin-config`는 sample1의 base URL, 상대 path, 응답 경로와 offset 설정을 `CollectionDefinition`으로 만든다. #14의 NestJS mock API는 loopback에서 72건을 offset·limit으로 제공한다. 이 변경은 두 경계를 연결하지만 수집 코어가 NestJS나 DB에 의존하지 않아야 하며, 한 페이지 JSON은 파싱을 위해 메모리에 둘 수 있어도 전체 실행 결과는 누적할 수 없다.

현재 `source-v1`에는 실행 자원 한도가 없다. 이슈 완료 조건에 따라 구현 전에 sample1의 기본 검증값을 timeout 5,000 ms, 응답 2 MiB, 단일 레코드 256 KiB로 정한다. 공개 schema 허용 범위는 timeout 100~300,000 ms, 응답 1 KiB~100 MiB, 단일 레코드 1 byte~100 MiB이며 교차 검증으로 단일 레코드 한도가 응답 한도를 넘지 않게 한다. 기본값을 암묵 적용하지 않고 Git 설정에 명시해 배포 revision과 함께 검증한다.

## Goals / Non-Goals

**Goals:**

- 검증된 정의와 묶음 처리 callback만으로 실행 가능한 프레임워크 독립 수집 API를 제공한다.
- 페이지 단위 역압력, 안정적인 종료 판정, 압축 해제 후 응답 크기와 레코드 크기 제한을 제공한다.
- 실패 원인을 코드로 구분하면서 URL의 query, 응답 본문과 설정 비밀은 오류에서 제외한다.
- Node.js 24와 pnpm workspace의 실제 loopback HTTP 테스트에서 기능·자원 동작을 재현한다.

**Non-Goals:**

- callback 내부의 가공·검증·DB 저장 또는 checkpoint 영속화를 구현하지 않는다.
- offset 수집 중 변하는 실제 원천에서 중복·누락을 해결하지 않는다. 대신 `total` 변경과 페이지 불일치를 감지한다.
- retry, 인증 secret 해석, redirect 정책 확장, single/cursor/page/CSV 수집을 추가하지 않는다.
- 임의 callback을 강제 종료하지 않는다. 취소 신호를 전달하고 callback이 완료 또는 실패한 뒤 자원을 정리한다.

## Decisions

### 별도 workspace 패키지에 함수형 수집 경계를 둔다

`packages/http-collector`가 `CollectionDefinition`, 처리 callback과 선택적 외부 `AbortSignal`을 받는 비동기 함수를 제공한다. 결과는 처리한 레코드·페이지 수와 최초 `total` 같은 작은 요약만 반환한다. callback에는 현재 묶음, offset, total과 결합된 취소 신호를 전달한다.

API 앱 내부 provider로 구현하는 대안은 NestJS DI와 서버 수명주기에 결합되어 CLI·worker 재사용을 방해한다. AsyncIterable로 페이지를 노출하는 대안은 소비자가 다음 페이지를 미리 요청하거나 처리 실패 경계를 다르게 구현할 여지가 있으므로, 이번에는 `await callback` 자체를 역압력 계약으로 사용한다.

### Node.js 내장 fetch와 Web Stream으로 압축 해제 후 크기를 센다

Node.js 24 내장 `fetch`의 응답 body reader에서 받은 각 `Uint8Array.byteLength`를 합산하고 한도를 넘는 즉시 reader와 요청을 취소한다. fetch가 content encoding을 해제한 body를 제공하므로 이 합계가 압축 해제 후 실제 제한 기준이다. `Content-Length`는 명백한 초과를 조기에 거부하는 최적화로만 사용할 수 있고 최종 판정 근거로 사용하지 않는다.

응답 전체를 `response.json()`으로 읽는 대안은 수신 도중 한도를 적용할 수 없다. streaming JSON parser는 페이지 내부 항목까지 점진 처리할 수 있지만 의존성과 오류 복잡도가 커지고, 설정된 응답 상한으로 페이지 메모리를 이미 제한하므로 이번 범위에는 과도하다.

### 페이지 전체 검증 뒤 callback을 한 번 호출한다

제한 내 본문을 UTF-8로 해석하고 `JSON.parse`한 뒤 dot-separated 경로를 own-property 단위로 탐색한다. items 배열의 각 값을 `JSON.stringify`한 UTF-8 바이트로 측정하며 직렬화할 수 없거나 한도를 넘는 항목이 있으면 페이지 전체를 거부한다. 구조, total 일관성, 기대 페이지 건수를 모두 통과한 원본 items 배열만 callback에 전달한다.

파싱 중 정상 항목부터 callback으로 전달하는 대안은 뒤에서 초과/오류 항목을 발견했을 때 부분 저장을 유발한다. 레코드 크기를 원문 substring으로 측정하는 대안은 일반 JSON parser만으로 경계를 안정적으로 복원하기 어렵기 때문에, 공개 기준을 후속 처리와 동일한 UTF-8 JSON 직렬화 크기로 정의한다.

### total과 offset으로 정확한 페이지 크기를 검증한다

첫 응답의 `total`을 실행 기준으로 고정한다. 각 페이지 기대 건수는 `min(limit, total - offset)`이며 실제 items 길이가 다르면 전달 전 실패한다. 성공 callback 이후 `offset += items.length`로 진행하고 `offset === total`이면 추가 빈 요청 없이 종료한다. `total === 0`은 빈 첫 응답 한 번을 검증한 뒤 0건 완료하며, 설정 start가 total보다 큰 경우는 구성과 원천이 맞지 않는 불완전 응답으로 거부한다.

`items.length < limit`만으로 종료하는 대안은 원천 조기 빈 응답을 정상 완료로 오인한다. 매 페이지의 새 total을 그대로 따르는 대안은 offset 기반 수집 중 원천 변경을 숨기므로 선택하지 않는다.

### timeout과 호출자 취소를 하나의 요청 신호로 결합한다

실행 전체에 caller signal을 적용하고 각 HTTP 요청/본문 수신에는 설정 timeout을 적용한다. 두 신호 중 먼저 발생한 원인을 보존해 `cancelled`와 `timeout`을 구분한다. 취소 시 body reader를 취소하고 callback에는 실행 신호를 전달한다. callback 실패는 원인을 보존한 `processing` 오류로 감싸며 다음 요청은 시작하지 않는다.

단일 실행 전체 timeout을 두는 대안은 정상적인 다수 페이지와 느린 저장 시간을 원천 응답 지연으로 오인한다. callback에 timeout을 강제하는 대안은 실제 DB 트랜잭션 정리 없이 promise만 포기할 수 있으므로 후속 저장 계약에서 별도로 다룬다.

### 안정적인 오류 코드와 비밀 제외 메시지를 제공한다

오류는 `http_status`, `timeout`, `cancelled`, `response_too_large`, `record_too_large`, `invalid_json`, `invalid_response`, `total_changed`, `count_mismatch`, `processing` 코드와 원인(cause)을 제공한다. 요청 위치는 origin과 pathname 및 offset만 포함하고 기존 query, 응답 본문, header와 Connection 설정 원문은 포함하지 않는다.

문자열 메시지만 반환하는 대안은 테스트·CLI가 실패 종류를 안정적으로 분류하기 어렵다. 응답 일부를 진단용으로 싣는 대안은 원천의 비밀·업무 데이터 노출 가능성이 있어 제외한다.

### 실제 HTTP 및 격리 프로세스 메모리 검증을 workspace 테스트에 연결한다

통합 테스트는 임시 loopback HTTP server로 sample1과 사용자 정의 경로, chunked·gzip·지연·오류·변형 응답을 제공한다. 역압력은 첫 callback promise를 제어해 요청 횟수가 1에 머무는지 확인한다. 메모리 검증은 `node --expose-gc` 자식 프로세스에서 동일 크기 payload의 작은 실행과 페이지 수 10배 실행을 각각 수행하고 callback 후 GC한 heap peak 증가분이 작은 실행의 2배 또는 16 MiB 여유 중 큰 기준을 넘지 않는지 확인한다. Node.js 24를 고정하고 payload/측정 횟수를 문서화한다.

요청 mock만 쓰는 단위 테스트는 실제 stream·압축·abort 동작을 검증하지 못한다. 일반 테스트 프로세스의 heap을 직접 비교하는 대안은 병렬 테스트와 기존 객체의 영향을 받으므로 격리 프로세스를 사용한다.

## Risks / Trade-offs

- [한 페이지는 JSON 파싱 동안 본문 buffer와 객체가 함께 존재한다] → 응답 상한으로 최악 크기를 제한하고 전체 페이지 수와 무관한지 측정한다.
- [UTF-8 JSON 재직렬화 크기는 원문의 공백·escape 바이트와 다를 수 있다] → 응답 전체에는 원문 byte 제한을 적용하고 레코드 한도는 명시된 정규 측정 기준으로 일관되게 적용한다.
- [offset 수집 도중 레코드 순서가 바뀌면 total이 같아도 중복·누락될 수 있다] → 이번 계약의 제약으로 문서화하고 실제 연동에서 안정 정렬 또는 snapshot을 별도 검토한다.
- [callback이 취소 신호를 무시하면 즉시 종료할 수 없다] → 신호 전달을 계약화하고 다음 요청은 금지하며 후속 DB 처리기는 신호를 준수하도록 한다.
- [heap 측정은 런타임 노이즈가 있다] → Node 버전·격리 프로세스·강제 GC·절대 여유를 함께 사용하고 기능 테스트와 분리한다.

## Migration Plan

신규 수집 패키지를 추가한 뒤 `source-v1`의 필수 `limits`를 schema, 타입, sample1 설정과 문서에 함께 반영한다. 현재 설정은 아직 실제 수집기에 배포되지 않은 개발 단계이므로 별도 런타임 데이터 migration은 없다. 롤백은 수집 패키지와 테스트를 제거하고 source 계약·sample 설정을 이전 revision으로 함께 되돌린다.
