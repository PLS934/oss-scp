## Context

동기는 [proposal.md](proposal.md)를 따른다. 서버에는 이미 `GET /api/v1/records`와 `GET /api/v1/records/:id`가 있고, 목록은 고정 정렬·불투명 cursor와 20·50·100·200 묶음 크기를 제공한다. 현재 웹 앱의 유일한 API 코드는 health 확인 함수이며 업무 응답 타입이나 오류 계층은 없다.

## Goals / Non-Goals

**Goals:**

- React 컴포넌트와 무관한 작은 TypeScript 모듈로 요청·응답·오류 경계를 제공한다.
- 서버 타입을 브라우저 패키지로 직접 가져오지 않고 공개 HTTP 계약을 클라이언트 타입과 런타임 검증으로 표현한다.
- 모든 예상 결과를 판별 가능한 union으로 만들어 화면이 예외 문자열을 해석하지 않게 한다.

**Non-Goals:**

- 상태 관리, 캐시, 자동 재시도, timeout, 화면 렌더링은 추가하지 않는다.
- 서버·DB 계약을 확장하거나 원천 데이터를 직접 읽지 않는다.

## Decisions

### 함수는 판별 가능한 결과 union을 반환한다

`ApiResult<T> = { ok: true; data: T } | { ok: false; error: RecordApiError }` 형태를 사용한다. 입력·HTTP·네트워크·취소가 하나의 호출 계약에 들어와 컴포넌트가 try/catch와 서버 메시지 비교를 반복하지 않는다. 예외 기반 API는 일반적이지만 취소와 404·503의 분기가 화면마다 흩어지므로 채택하지 않는다.

오류 종류는 `INVALID_INPUT`, `INVALID_CURSOR`, `NOT_FOUND`, `NOT_READY`, `INVALID_RESPONSE`, `NETWORK_ERROR`, `ABORTED`, `API_ERROR`로 제한한다. 사용자 메시지는 클라이언트가 소유한 안전한 고정 문구이며 서버 본문은 코드 판별에 필요한 제한된 객체로만 읽고 결과에 보존하지 않는다.

### HTTP 계약은 웹 모듈에서 독립적으로 표현하고 검증한다

`apps/web/src/records.ts`가 JSON 값, 레코드, 요약, collection, pageInfo와 목록 응답 타입을 공개한다. 서버 내부 패키지 의존성을 웹 앱에 추가하면 Node 전용 코드와 결합될 수 있으므로 타입을 직접 import하지 않는다. 대신 타입 가드가 plain object, UUID, ISO timestamp, JSON 재귀 값, 허용된 enum과 필수 키 타입을 검증한다. 선언된 필드 외 추가 필드는 호환성을 위해 허용하되 사용하거나 추정하지 않는다.

### 요청 생성은 URLSearchParams와 상대 경로만 사용한다

목록 입력은 trim 이후 비어 있지 않은 식별자와 허용 limit을 fetch 전에 검사한다. 유효한 원문 식별자와 cursor는 `URLSearchParams`가 인코딩하며 cursor 자체는 해석하거나 변경하지 않는다. 상세 ID는 UUID를 먼저 검증하고 `encodeURIComponent`로 경로에 넣는다. fetch 구현은 테스트 가능성을 위해 선택적 의존성으로 받되 기본값은 전역 fetch를 사용한다.

### 취소는 AbortSignal을 그대로 전달하고 별도 결과로 매핑한다

호출자가 소유한 signal을 fetch options에 전달한다. signal이 이미 취소되었거나 fetch가 AbortError로 실패하면 `ABORTED`를 반환한다. 이 계층은 화면 상태를 직접 수정하지 않으며, 후속 화면은 `ABORTED` 결과를 무시하거나 요청 세대와 함께 사용해 이전 응답이 새 상태를 덮지 않게 한다.

## Risks / Trade-offs

- [서버와 클라이언트 타입 정의가 어긋날 수 있음] → 서버 API 문서의 모든 필드를 Mock 응답 테스트로 고정하고 런타임 검증 실패를 명시적으로 분류한다.
- [엄격한 검증이 추가 서버 필드를 거부할 수 있음] → 필수 필드와 알려진 필드 타입만 검사하고 알 수 없는 추가 필드는 무시해 additive 변경을 허용한다.
- [503이 일시 장애와 미지원 adapter를 함께 나타냄] → 현재 서버 계약 범위에서 모두 `NOT_READY`로 분류하고 내부 원인은 노출하지 않는다.
- [결과 union을 무시하면 취소 응답이 화면에 표시될 수 있음] → `ABORTED`를 명시적 종류로 제공하고 후속 UI 문서에서 취소 결과를 상태 갱신에 사용하지 않도록 안내한다.

## Migration Plan

새 모듈은 아직 소비자가 없어 기존 동작에 영향을 주지 않는다. 배포 시 정적 웹 번들에 포함되며 서버 배포 순서는 필요하지 않다. 문제가 있으면 모듈과 테스트·문서 추가만 되돌릴 수 있다.
