## Context

`packages/http-collector`는 `OffsetCollectionDefinition`으로 loopback 또는 외부 JSON API를 호출하며, 응답 수신 한도, UTF-8 JSON 파싱, 레코드 크기 검사, timeout·취소와 오류 정규화를 한 파일에서 제공한다. `packages/plugin-config`의 single 정의는 `itemsPath`와 선택적 `metadataPaths`를 제공하지만 실행 한도는 없고, 실제 HTTP 실행기는 offset 정의만 받는다.

`packages/collection-engine`의 가공 경계는 레코드 iterable과 선택적 `responseMetadata`를 이미 분리해 받는다. 따라서 single 수집기는 원본 응답 전체를 넘기지 않고 선언된 metadata만 구성해야 하며, 실제 가공 실행이나 저장을 직접 호출하지 않는다.

## Goals / Non-Goals

**Goals:**

- 기존 offset 공개 API와 동작을 유지하면서 single 전용 공개 실행 API를 추가한다.
- 두 수집 방식이 HTTP 요청·본문 제한·파싱·레코드 검증·오류 규칙을 같은 내부 구현으로 사용한다.
- single 처리 함수가 목록과 허용된 metadata를 한 번 받고 완료될 때까지 수집 완료가 지연되게 한다.
- 수집 정의의 판별 가능한 union이 호출 지점에서 방식별 필드를 타입 안전하게 좁히도록 유지한다.

**Non-Goals:**

- single 수집기에서 가공 모듈, DB 저장, checkpoint나 담당자 정보를 처리하지 않는다.
- retry, 인증 secret 해석, redirect 허용, page·cursor·custom·HTTP CSV 방식을 추가하지 않는다.
- JSON 스트리밍 파서를 도입하지 않는다. 설정된 응답 한도 안에서 단일 JSON 문서를 메모리에 파싱한다.

## Decisions

### 방식별 공개 함수와 공유 내부 HTTP 기반을 사용한다

`collectHttpSingle(definition, onBatch, options)`을 `collectHttpOffset`과 나란히 제공한다. 요청 실행, 제한된 본문 읽기, UTF-8 JSON 파싱, dot 경로 해석, 레코드 직렬화 크기 검사와 공통 오류 생성을 방식에 독립적인 내부 함수로 분리한다. offset의 위치 문구와 pagination 검증은 offset 실행기에 남기고, single 오류 위치에는 query를 제외한 origin·pathname만 포함한다.

하나의 `collectHttp(definition, callback)`에서 union을 분기하는 대안은 호출자의 입력·콜백 타입을 넓히고 기존 공개 계약을 바꿀 수 있어 선택하지 않는다. 기존 코드를 single에 복제하는 대안은 timeout·취소·크기 제한 수정이 방식별로 어긋날 위험이 있어 선택하지 않는다.

### single 콜백은 목록과 경로별 metadata를 한 번 전달한다

콜백 payload는 `items`, `responseMetadata`, `signal`을 가진 single 전용 타입으로 둔다. `responseMetadata`는 각 `metadataPaths` 문자열을 key로 사용하고 해당 경로에서 찾은 값을 value로 갖는 얕은 객체다. sample2는 `{ test_field6: true }`가 된다. 경로가 응답에 없으면 설정과 실제 응답이 맞지 않으므로 목록을 전달하기 전에 `invalid_response`로 실패한다. 선언이 없으면 metadata는 빈 객체가 아니라 `undefined`로 전달해 가공 런타임의 선택 속성과 맞춘다.

metadata를 items 배열에 붙이는 대안은 레코드와 응답 문맥의 책임을 섞는다. 원본 응답을 함께 넘기는 대안은 미선언 값 노출과 불필요한 보관을 허용하므로 사용하지 않는다. metadata의 leaf 이름만 key로 쓰는 대안은 서로 다른 중첩 경로가 충돌할 수 있어 전체 선언 경로를 key로 유지한다.

### 빈 목록은 콜백 없이 정상 완료한다

single은 별도 `total`이 없으므로 검증된 배열 길이를 완료 건수로 사용한다. 비어 있으면 HTTP 요청은 성공했지만 처리할 레코드가 없는 정상 상태로 보고 callback을 호출하지 않는다. 비어 있지 않으면 모든 레코드와 metadata를 검증한 후 callback을 한 번 호출하고 성공을 기다린다. 요약은 `{ requests: 1, records }`만 반환하여 원본 데이터를 유지하지 않는다.

빈 목록에도 metadata 전달을 위해 콜백을 호출하는 대안은 기존 offset의 빈 결과 동작과 다르고 레코드 처리 callback의 의미를 흐리므로 선택하지 않는다. 빈 원천 metadata만 별도로 소비해야 하는 요구는 현재 범위에 없다.

### single에도 명시적 HTTP 실행 한도를 요구한다

single source schema와 내부 정의에 offset과 동일한 `limits` 구조를 필수로 추가하고 sample2가 값을 명시하게 한다. 암묵적 기본값은 운영자가 대형 단일 응답의 자원 위험을 확인하기 어렵고 검증된 정의만 실행한다는 기존 경계와 맞지 않는다. 범위와 `maxRecordBytes <= maxResponseBytes` 교차 검증은 offset과 같은 공통 검증을 재사용한다.

### HTTP 수신 signal과 처리 signal의 책임을 분명히 한다

요청 timeout은 HTTP 요청과 본문 수신까지만 제어하며 callback 실행 시간에는 적용하지 않는다. 호출자 `AbortSignal`은 요청과 callback에 동일하게 전달한다. callback이 취소를 협력적으로 처리하지 않으면 완료를 기다린 뒤 `cancelled`를 반환하고 정상 완료로 표시하지 않는다. 이 동작은 기존 offset 처리 경계와 일치한다.

## Risks / Trade-offs

- [single JSON 전체를 파싱하는 동안 응답 한도만큼 메모리가 필요함] → 설정된 응답 한도를 수신 중 적용하고 결과에 원본을 보관하지 않으며 JSON streaming은 후속 대형 원천 요구가 생길 때 별도 설계한다.
- [공통 내부 함수 추출이 기존 offset 동작을 바꿀 수 있음] → 기존 offset 테스트를 수정 없이 유지하고 오류 코드·메시지 비밀 제외·메모리 검증을 회귀 실행한다.
- [metadata 값 자체가 큰 경우 응답과 함께 callback 동안 유지됨] → metadata도 같은 응답 바이트 한도 안에 있으며 선언된 경로만 전달하고 callback 완료 후 참조를 보관하지 않는다.
- [JSON 재직렬화 크기는 원본 표현 크기와 다를 수 있음] → 기존 offset 계약과 동일한 UTF-8 `JSON.stringify` 기준을 유지해 방식별 예측 가능성을 우선한다.

## Migration Plan

single source schema를 먼저 실행 한도 필수 계약으로 확장하고 sample2 설정을 같은 변경에서 갱신한다. 그다음 공유 HTTP 기반을 추출하되 기존 offset 테스트를 통과시킨 후 single API와 테스트·문서를 추가한다. 아직 single HTTP 실행 소비자가 없으므로 런타임 migration은 없으며, 롤백은 single 실행 API와 sample2 한도 필드를 제거하고 offset 전용 내부 구현으로 되돌릴 수 있다.
