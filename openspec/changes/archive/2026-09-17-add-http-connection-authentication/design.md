## Context

동기는 [proposal.md](proposal.md)의 Why를 따른다. 현재 HTTP Connection은 `config.baseUrl`만 가지고, 설정 로더가 이를 JSON offset·single 및 HTTP CSV 내부 정의의 `{ id, baseUrl }`로 축약한다. JSON 수집기는 WHATWG `fetch`, CSV 수집기는 Node `http`/`https` 요청을 사용하므로 헤더 주입 지점은 다르지만 두 경로 모두 `@oss-scp/plugin-config` 타입에 의존한다.

비밀값은 Git으로 관리하는 외부 설정과 브라우저 공개 응답에 들어가면 안 된다. 실제 수집은 API 기동 경로와 독립 CLI 경로에서 같은 collector를 사용하므로, 값을 설정 검증 시점이 아닌 collector 호출 시점의 프로세스 환경에서 읽어야 한다.

## Goals / Non-Goals

**Goals:**

- 하나의 검증된 HTTP 인증 타입을 JSON·CSV 수집기가 공유한다.
- 비밀 참조는 내부 정의까지 전달하되 실제 값은 요청 직전에만 생성한다.
- 인증 설정 오류와 외부 HTTP 오류 모두 credential을 노출하지 않는다.
- 인증 설정이 없는 기존 정의에는 실행·메모리 동작 변화를 만들지 않는다.

**Non-Goals:**

- token 발급을 위한 로그인 요청, OAuth refresh, 만료 감지 및 재시도
- HMAC 등 요청별 서명이나 복수 인증 헤더 조합
- 브라우저에서 credential을 입력·수정하는 관리 UI
- HTTP 인증에 file secret 참조를 추가하는 작업

## Decisions

### 1. 인증을 HTTP Connection의 판별 공용체로 정의한다

`config.auth`를 선택 필드로 두고 `apiKey`, `bearer`, `basic` 판별 공용체를 사용한다. 각 비밀 요소는 `{ env: "NAME" }`만 허용한다. source는 요청 경로와 형식만 유지하고 환경별 접속·인증 정보는 Connection이 소유한다.

임의 헤더 map 전체를 받는 방식은 유연하지만 비인증 헤더와 위험한 전송 헤더까지 설정 범위를 넓히므로 제외한다. 문자열 보간을 모든 JSON 값에 적용하는 방식도 비밀 사용 지점을 감사하기 어렵고 범위를 불필요하게 확대하므로 제외한다.

### 2. 공통 resolver가 인증 헤더만 생성한다

`plugin-config`에 인증 타입과 환경변수를 입력받아 읽기 전용 헤더 map을 반환하는 작은 resolver를 둔다. JSON·CSV 수집기는 같은 resolver를 호출하고 각 전송 API에 결과를 전달한다. resolver는 빈 값과 CR/LF를 거부하고 Basic 사용자명에 구분자 `:`가 있으면 안전한 설정 오류로 처리한다.

각 collector가 직접 환경변수와 인코딩 규칙을 구현하는 대안은 오류·비노출 동작이 갈라질 위험이 있어 제외한다. 설정 로더에서 실제 값을 해석하는 대안은 검증 CLI에 credential을 요구하고 실제 수집 프로세스 환경과 다른 값을 읽을 수 있어 제외한다.

### 3. 내부 정의에는 참조만 전달하고 공개 모델은 유지한다

설정 로더는 `auth` 참조를 서버 내부 `CollectionDefinition`에 복사한다. 브라우저용 `ClientPluginConfiguration`, 메뉴 및 endpoint 요약은 기존 공개 projection을 유지하므로 인증 참조 자체도 노출하지 않는다. 실제 값은 어느 설정 결과 객체에도 저장하지 않는다.

환경변수 이름은 실제 secret은 아니지만 공격자가 배포 환경을 추정하는 단서가 될 수 있으므로 브라우저 공개 계약에서는 제외한다.

### 4. collector별 안정적인 인증 오류로 변환한다

공통 resolver는 문제 환경변수 이름만 가진 전용 오류를 반환한다. 각 collector는 이를 자신의 `authentication` 오류 코드로 변환하며 실제 값이나 원본 transport 오류를 cause로 연결하지 않는다. 외부 서버의 401·403은 기존 `http_status` 계약을 유지하고 URL query·응답 본문·헤더를 오류에 포함하지 않는다.

환경변수 누락을 schema 검증 오류로 처리하는 대안은 offline 설정 검증과 기존 배포 검증 흐름을 깨므로 제외한다.

### 5. 선택 필드로 schema 버전 호환성을 유지한다

`oss-scp/connection-v1`에 선택적 `auth`만 추가한다. 기존 `{ baseUrl }` Connection은 빈 헤더 map으로 처리하고 fetch에는 빈 `headers` 옵션조차 추가하지 않아 기존 비인증 요청과 대용량 메모리 회귀 특성을 유지한다.

새 API version을 만드는 방식은 기존 계약을 깨지 않으면서 선택 기능을 추가할 수 있는 상황에서 불필요한 migration 비용을 만들므로 제외한다.

## Risks / Trade-offs

- [환경변수는 프로세스 전체 범위여서 같은 프로세스의 코드가 읽을 수 있음] → 설정과 로그에 복사하지 않고 배포 플랫폼의 최소 권한·secret 주입 기능을 사용하도록 문서화한다.
- [고정 Bearer token 만료 시 수집 실패] → 명시적인 비지원 범위로 문서화하고 갱신 흐름은 별도 capability로 다룬다.
- [사용자 지정 API key 헤더가 전송 동작에 영향을 줄 수 있음] → RFC token 형태의 헤더 이름만 schema에서 허용하고 값의 CR/LF를 요청 전에 거부한다.
- [Basic credential의 문자열 인코딩 해석이 서버마다 다를 수 있음] → UTF-8 결합 후 Base64로 일관되게 생성하고 대상 서버 정책은 운영자가 확인한다.
- [환경변수 이름도 운영 구조를 드러낼 수 있음] → 서버 내부 정의에만 유지하고 브라우저 API에서는 제외한다.

## Migration Plan

1. schema·타입·공통 resolver를 배포한다.
2. JSON·CSV collector를 함께 배포해 두 전송 경로가 같은 인증 계약을 사용하게 한다.
3. 인증이 필요한 Connection에만 `auth`를 추가하고 API 또는 CLI 프로세스에 해당 환경변수를 주입한다.
4. 기존 인증 없는 Connection은 변경하지 않는다.
5. 문제가 생기면 Connection의 선택적 `auth`를 제거해 기존 비인증 동작으로 되돌리거나 이전 서버 이미지를 사용한다. 설정에 실제 비밀값이 없으므로 별도 데이터 migration은 없다.
