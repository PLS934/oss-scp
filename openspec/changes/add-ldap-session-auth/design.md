## Context

현재 NestJS API에는 전역 인증 경계가 없고 React 앱은 시작 즉시 health와 메뉴 API를 호출한다. 플랫폼 DB는 PostgreSQL과 MySQL adapter를 지원하고 migration은 API 기동 전에 명시적으로 적용한다. 배포 웹은 Nginx가 정적 파일과 동일 출처 `/api` proxy를 제공한다. 승인된 상세 설계는 `docs/superpowers/specs/2026-09-19-ldap-session-auth-design.md`, 외부 동작 계약은 `specs/ldap-session-auth/spec.md`를 따른다.

## Goals / Non-Goals

**Goals:**

- LDAP 제공자, 세션 저장소와 HTTP 인증 경계를 독립된 계약으로 나눠 테스트하고 추후 인증 제공자를 교체할 수 있게 한다.
- PostgreSQL과 MySQL에서 같은 세션 동작을 제공한다.
- 기본 비활성화 설치와 공개 health/ready 계약을 바꾸지 않는다.
- 비밀번호와 원본 세션 ID가 애플리케이션 수명보다 오래 남거나 진단 출력에 섞이지 않게 한다.

**Non-Goals:**

- 역할·그룹·담당 자산 권한 모델을 미리 추상화하지 않는다.
- 여러 API 인스턴스용 분산 rate limit 또는 세션 cache를 추가하지 않는다.
- LDAP 사용자 디렉터리를 플랫폼 사용자 테이블로 동기화하지 않는다.

## Decisions

### 인증 제공자와 세션 관리를 분리한다

API 인증 하위 시스템은 `authenticate(loginId, password)` 형태의 제공자 계약, 세션 저장소 계약, HTTP controller/guard로 나눈다. LDAP 구현은 사용자 검색과 Bind까지만 책임지고 쿠키나 DB를 알지 못한다. 세션 서비스는 LDAP SDK를 알지 못하고 정규화된 사용자 신원만 받는다.

Passport LDAP 전략을 중심에 두는 대안은 빠른 초기 연결에는 유리하지만 LDAP SDK, 세션 middleware와 Nest 요청 수명에 계약이 묶인다. 현재 코드의 명시적 adapter/DI 패턴과 장래 인증 제공자 교체를 고려해 얇은 자체 경계를 선택한다.

### LDAPS와 필수 StartTLS를 하나의 안전한 연결 정책으로 취급한다

LDAP URL이 `ldaps://`면 TLS socket으로 연결하고, `ldap://`면 연결 직후 StartTLS가 성공하기 전에는 Bind 또는 검색을 허용하지 않는다. 두 경로 모두 `rejectUnauthorized`를 강제하며 선택 CA는 검증한 PEM만 전달한다. TLS 비활성화 플래그는 만들지 않는다.

LDAPS만 지원하는 대안은 단순하지만 389/StartTLS를 표준으로 쓰는 AD 설치를 배제한다. 평문 LDAP 선택지는 비밀번호 전송 요구와 충돌하므로 제외한다.

### 검색 후 사용자 DN Bind를 사용한다

서비스 Bind 연결에서 RFC 4515 escaping한 로그인 값을 설정 filter의 `{{login}}`에 대입하고 search base 아래를 검색한다. 결과가 정확히 하나여야 하며 설정한 ID 속성을 문자열 또는 binary에서 정규화한다. 별도 연결에서 검색 결과 DN과 사용자 비밀번호로 Bind한다. 실패 여부와 관계없이 연결을 닫는다.

로그인 ID로 DN을 직접 조합하는 대안은 search Bind 계정을 줄일 수 있지만 DN escaping과 조직별 OU 구조에 강하게 결합되므로 선택하지 않는다.

### 원본 세션 ID 대신 keyed hash를 DB 키로 쓴다

로그인 성공 시 32-byte CSPRNG 값을 base64url session ID로 만들고, 세션 secret을 키로 한 HMAC-SHA-256 결과를 DB 기본 키로 저장한다. 쿠키에는 원본만 담는다. 일반 SHA-256도 무작위 ID에는 충분한 탐색 저항성이 있지만 issue의 session secret 설정을 실제 서버측 키 분리에 사용하고 DB 유출 시 방어층을 더하기 위해 HMAC을 선택한다.

세션은 absolute TTL을 사용한다. 요청마다 갱신하는 sliding session은 DB 쓰기와 동시성 복잡도를 늘리므로 제외한다. 로그인 성공 시 제한된 수의 만료 행을 정리하고, 조회한 세션이 만료됐으면 삭제한다.

### DB adapter별 세션 repository를 platform-db에 둔다

PostgreSQL과 MySQL migration에 같은 논리 컬럼을 가진 `auth_sessions`를 추가한다. `packages/platform-db`에 공통 입력·결과 계약과 DB별 SQL 구현을 두고 기존 연결의 `withClient` 경계를 재사용한다. API가 SQL dialect를 분기하는 대안보다 기존 DB adapter 책임과 일치한다.

### 전역 guard는 allowlist 방식으로 적용한다

인증 활성화 시 모든 controller를 기본 보호하고 health, ready, session 조회, login, idempotent logout만 명시적으로 공개한다. 각 기존 controller에 guard를 반복 부착하는 denylist 방식은 새 endpoint가 실수로 공개될 수 있어 사용하지 않는다. 비활성화 상태에서는 guard가 즉시 통과해 기존 응답 계약을 보존한다.

쿠키 parser 전체 의존성 대신 필요한 단일 쿠키를 엄격하게 해석하는 작은 유틸리티를 둘 수 있다. 상태 변경 메서드는 Origin과 Host를 비교하고 reverse proxy 신뢰는 명시된 설정 범위 안에서만 사용한다.

### 로그인 제한은 단일 프로세스 메모리에 둔다

현재 공식 Compose 배포는 API 단일 인스턴스다. IP와 `HMAC(secret, normalizedLoginId)` 각각에 5분/10회 기본 고정 시간창을 적용하고 만료 bucket을 제거한다. 성공하면 로그인 ID bucket을 초기화한다.

DB 기반 제한은 재시작과 다중 인스턴스에 강하지만 로그인마다 DB 쓰기와 별도 정리 정책을 요구한다. 현재 배포 범위에는 과도하므로 adapter 경계 뒤의 in-memory 구현으로 시작하고 다중 인스턴스 지원 시 공유 저장소로 교체한다.

### 웹 bootstrap을 인증 상태 머신으로 감싼다

웹은 `unknown`, `disabled`, `anonymous`, `authenticated` 상태를 가진 인증 bootstrap을 먼저 실행한다. `disabled`와 `authenticated`에서만 기존 앱이 menu/data 요청을 시작한다. 로그인 성공은 세션 상태를 다시 읽고, 로그아웃이나 보호 API의 401은 기존 화면 상태를 폐기한 뒤 `anonymous`로 전환한다.

라우터에서 `/login`만 추가하고 기존 앱도 동시에 mount하는 방식은 anonymous 상태에서 업무 API가 먼저 호출될 수 있어 선택하지 않는다.

## Risks / Trade-offs

- [API 프로세스 재시작 시 rate limit 초기화] → 공식 단일 인스턴스 범위를 문서화하고 보안 경계를 adapter 뒤에 둬 후속 공유 저장소 전환을 가능하게 한다.
- [LDAP 서버와 SDK별 StartTLS 또는 binary 속성 차이] → 얇은 LDAP client adapter와 fake 단위 테스트를 두고 실제 LDAP test container 경로에서 LDAPS/StartTLS를 검증한다.
- [운영에서 Secure 쿠키가 HTTP로 전달되지 않음] → 인증 활성화 운영 배포는 HTTPS 종단 뒤로 제한하고 proxy protocol 신뢰 설정과 점검 절차를 문서화한다.
- [전역 guard 도입이 기존 테스트에 영향을 줌] → 기본 비활성화 설정을 테스트 fixture 기본값으로 유지하고 별도 활성화 suite에서 공개/보호 경계를 검증한다.
- [DB별 시간·binary 표현 차이] → UTC 절대 시각과 고정 길이 hex HMAC을 공통 표현으로 사용하고 두 adapter에 동일 계약 테스트를 적용한다.
- [Origin 검사가 비브라우저 상태 변경 client를 막음] → 쿠키 인증 요청에만 검사하고 문서화된 동일 출처 웹 경로를 기준 계약으로 둔다.

## Migration Plan

1. PostgreSQL과 MySQL에 `auth_sessions` migration을 배포하고 기존 migration 절차로 먼저 적용한다.
2. 인증 기능이 포함된 API와 웹 이미지를 `AUTH_ENABLED=false` 기본값으로 배포해 기존 동작과 health/ready를 확인한다.
3. LDAP URL, service Bind, search base/filter, ID 속성, secret file, 선택 CA와 HTTPS reverse proxy를 준비한다.
4. `AUTH_ENABLED=true`로 재기동하고 LDAPS 또는 StartTLS 로그인, 새로고침, 로그아웃과 API 보호를 검증한다.

롤백은 먼저 인증을 비활성화하고 이전 API/웹 이미지로 되돌린다. 추가 세션 테이블은 기존 코드가 참조하지 않으므로 남겨도 호환되며, schema 제거가 필요하면 별도 하향 migration과 백업 절차로 수행한다. 장애 시 인증을 자동 비활성화하는 fail-open 전환은 하지 않는다.
