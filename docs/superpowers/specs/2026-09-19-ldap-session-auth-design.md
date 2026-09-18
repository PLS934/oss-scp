# LDAP/AD 로그인과 서버 세션 인증 설계

## 목적

`AUTH_ENABLED=true`인 설치에서 단일 LDAP 또는 Active Directory를 이용해 사용자를 인증하고, 플랫폼 DB에 저장한 서버 세션으로 웹 화면과 API를 보호한다. 인증이 비활성화된 기본 설치는 기존처럼 로그인 없이 동작해야 한다.

이 설계는 GitHub issue #123의 범위만 다룬다. LDAP 그룹과 플랫폼 역할 매핑, 복수 디렉터리, SAML/OIDC, 플랫폼 자체 비밀번호, 디렉터리 전체 동기화, 관리자용 세션 강제 종료 UI는 제외한다.

## 결정 사항

- PostgreSQL과 MySQL을 동일한 기능 수준으로 지원한다.
- `/api/v1/health`, `/api/v1/ready`, 로그인과 세션 확인 API만 인증 없이 호출할 수 있다.
- LDAP 인증 제공자와 플랫폼 세션 관리를 분리한다.
- `ldaps://` 직접 TLS와 `ldap://` 연결 후 필수 StartTLS를 모두 지원한다.
- 두 LDAP 전송 방식 모두 서버 인증서를 검증한다. 검증을 끄거나 평문으로 Bind하는 설정은 제공하지 않는다.
- 세션 원본은 HttpOnly 쿠키에만 두고 DB에는 HMAC-SHA-256 해시만 저장한다.
- 로그인 rate limit은 현재 단일 API 인스턴스 배포 모델에 맞춰 프로세스 메모리에 둔다.

## 런타임 구조

API에 인증 하위 시스템을 추가한다. 각 구성요소는 다음 경계를 가진다.

### 인증 설정

`AuthConfig`는 환경변수를 읽고 상호 의존성을 검증한다. `AUTH_ENABLED`의 기본값은 `false`다. 비활성화 상태에서는 LDAP와 세션 설정을 요구하지 않는다. 활성화 상태에서 설정이 누락되거나 안전하지 않으면 서버를 시작하지 않는다.

지원 설정은 다음과 같다.

```text
AUTH_ENABLED=false
LDAP_URL=ldaps://ldap.example.com:636
LDAP_BIND_DN=cn=service,ou=system,dc=example,dc=com
LDAP_BIND_PASSWORD_FILE=/run/secrets/ldap-bind-password
LDAP_USER_SEARCH_BASE_DN=ou=users,dc=example,dc=com
LDAP_USER_SEARCH_FILTER=(uid={{login}})
LDAP_USER_ID_ATTRIBUTE=entryUUID
LDAP_TLS_CA_FILE=/run/secrets/ldap-ca.pem
AUTH_SESSION_SECRET_FILE=/run/secrets/session-secret
AUTH_SESSION_TTL_SECONDS=28800
```

Bind 비밀번호와 세션 secret은 직접 환경변수도 지원해 로컬 개발과 테스트를 가능하게 한다. 직접 값과 `_FILE`을 동시에 지정하면 모호한 설정으로 간주해 기동을 거부한다. secret file은 크기와 형식을 제한하고 오류 메시지에 내용을 포함하지 않는다. 세션 secret은 충분한 엔트로피를 갖도록 최소 길이를 검증한다.

`LDAP_URL`은 `ldaps://` 또는 `ldap://`만 허용한다. `ldap://`를 사용하면 연결 직후 StartTLS를 완료한 다음에만 서비스 계정 Bind, 검색, 사용자 Bind를 수행한다. `LDAP_TLS_CA_FILE`이 없으면 OS 또는 컨테이너의 신뢰 저장소를 사용하고, 있으면 유효한 PEM CA 인증서를 추가한다.

### LDAP 인증 제공자

`LdapAuthenticator`는 플랫폼과 무관한 인증 제공자 계약을 구현한다.

1. 서비스 계정으로 안전한 TLS 연결을 생성한다.
2. 입력한 로그인 ID를 RFC 4515 규칙으로 이스케이프한 뒤 `{{login}}` 자리에 대입한다.
3. 설정한 Search Base DN 아래에서 사용자를 검색한다.
4. 결과가 정확히 하나일 때 검색 결과 DN을 사용해 별도 연결에서 사용자 비밀번호로 Bind한다.
5. 성공 시 `LDAP_USER_ID_ATTRIBUTE`에서 읽은 안정적인 사용자 식별자와 로그인 ID만 플랫폼에 반환한다. 일반 LDAP은 `entryUUID`, Active Directory는 `objectGUID`처럼 운영 디렉터리에 맞는 속성을 설정한다. 문자열과 binary 속성을 정규화된 문자열로 변환한다.
6. 모든 연결은 성공과 실패 경로에서 닫는다.

검색 결과가 0개 또는 복수이거나 사용자 Bind가 거부되면 동일한 잘못된 자격증명 결과가 된다. 연결, TLS, 서비스 Bind, 검색 자체의 실패는 내부적으로 디렉터리 장애로 분류한다.

### 세션 저장소

`SessionRepository`는 DB 종류와 무관하게 다음 동작을 제공한다.

- 세션 생성
- 세션 해시로 유효한 세션 조회
- 단일 세션 삭제
- 만료 세션의 제한적 일괄 삭제

PostgreSQL과 MySQL에 각각 새 migration을 추가한다. `auth_sessions` 테이블은 다음 논리 필드를 가진다.

| 필드 | 용도 |
| --- | --- |
| `session_hash` | HMAC-SHA-256 결과이며 기본 키 |
| `user_id` | LDAP가 반환한 안정적 사용자 식별자 |
| `login_id` | 화면 표시와 현재 사용자 응답에 사용할 로그인 ID |
| `created_at` | 세션 생성 시각 |
| `expires_at` | 절대 만료 시각 |

세션 조회는 만료 시각을 조건에 포함한다. 발견한 만료 세션은 삭제하고, 로그인 성공 시 한 번에 삭제할 행 수를 제한해 오래된 세션이 무한히 쌓이지 않게 한다. 별도 스케줄러는 이번 범위에 추가하지 않는다.

### HTTP 인증 경계

전역 Nest guard 또는 그에 준하는 단일 인증 경계가 모든 API 요청을 검사한다. 공개 경로는 다음뿐이다.

- `GET /api/v1/health`
- `GET /api/v1/ready`
- `GET /api/v1/auth/session`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`

`POST /api/v1/auth/logout`은 유효한 쿠키가 없어도 같은 성공 응답을 반환하는 멱등 공개 경로다. 쿠키가 있으면 대응하는 DB 세션을 삭제하고, 유효 여부와 관계없이 동일 속성의 쿠키를 만료시킨다. 그 밖의 기존 API는 인증 활성화 시 유효한 세션을 요구한다.

상태 변경 요청에는 쿠키의 `SameSite=Lax`와 더불어 `Origin`과 `Host` 일치 검사를 적용한다. 인증이 비활성화된 경우 guard는 기존 요청 흐름을 그대로 통과시키며 기존 API 응답 계약을 바꾸지 않는다.

## 로그인과 세션 흐름

1. 웹이 세션 상태를 조회한다.
2. 세션이 필요하면 사용자가 로그인 ID와 비밀번호를 입력한다.
3. API가 IP와 로그인 ID 키에 대한 rate limit을 검사한다.
4. LDAP 인증 제공자가 사용자 검색과 사용자 Bind를 수행한다.
5. 성공하면 API가 암호학적으로 안전한 256-bit 무작위 세션 ID를 생성한다.
6. API는 `HMAC-SHA-256(session secret, session ID)` 결과와 사용자 식별 정보, 만료 시각을 DB에 저장한다.
7. 원본 세션 ID는 HttpOnly 쿠키로 브라우저에 전달한다.
8. 후속 요청은 같은 방식으로 쿠키를 HMAC 처리한 값으로 세션을 조회한다.
9. 로그아웃은 DB 행을 삭제하고 동일 속성의 쿠키를 즉시 만료시킨다.

쿠키에는 `HttpOnly`, `SameSite=Lax`, `Path=/`를 적용한다. `NODE_ENV=production`에서는 `Secure`를 강제한다. 인증을 활성화한 운영 배포는 HTTPS를 종단하는 reverse proxy 뒤에 있어야 하며 전달된 프로토콜 신뢰 범위를 명시적으로 설정한다.

세션 만료는 절대 만료로 시작한다. 요청마다 무기한 연장하지 않으므로 설정한 TTL이 명확한 보안 경계가 된다. API 프로세스 재시작은 플랫폼 DB의 세션에 영향을 주지 않는다.

## 로그인 rate limit

현재 지원하는 Compose 구조가 API 단일 인스턴스이므로 프로세스 메모리의 고정 시간창 제한기를 사용한다.

- IP별로 기본 5분에 10회
- 정규화된 로그인 ID를 세션 secret으로 HMAC한 키별로 기본 5분에 10회
- 둘 중 하나라도 초과하면 `429 TOO_MANY_ATTEMPTS`와 `Retry-After` 반환
- 성공하면 해당 로그인 ID 키의 실패 횟수 초기화
- 저장 키와 로그에 원문 로그인 ID를 기록하지 않음
- 항목은 시간창이 지나면 제거해 메모리 증가를 제한

다중 API 인스턴스를 공식 지원하게 되면 이 계약 뒤의 구현을 공유 저장소 기반으로 교체한다. 이번 범위에서는 분산 rate limit을 도입하지 않는다.

## 오류와 비밀정보 처리

외부 응답은 사용자 존재 여부를 드러내지 않는다.

| 상황 | HTTP 응답 |
| --- | --- |
| 사용자 없음, 복수 검색 결과, 잘못된 비밀번호 | `401 INVALID_CREDENTIALS` |
| LDAP 연결, TLS, 서비스 Bind 또는 검색 장애 | `503 AUTH_SERVICE_UNAVAILABLE` |
| rate limit 초과 | `429 TOO_MANY_ATTEMPTS` |
| 보호 API에 세션 없음, 잘못됨 또는 만료 | `401 AUTH_REQUIRED` |

내부 진단은 위 범주보다 세밀하게 구분하되 DN, 원문 로그인 ID, 사용자 비밀번호, 서비스 Bind 비밀번호, 세션 ID, 세션 해시를 기록하지 않는다. 요청 본문을 통째로 로깅하지 않는다. 공개 오류에는 LDAP 라이브러리나 DB 드라이버 메시지를 포함하지 않는다.

비밀번호 입력은 비어 있거나 제어문자를 포함하거나 상한 길이를 넘으면 LDAP 호출 전에 거부한다. 로그인 ID도 길이와 제어문자를 검증한다. LDAP 필터 삽입 전 escaping은 필수이며 설정 필터에는 `{{login}}` 자리 표시자가 정확히 한 번 있어야 한다.

## 웹 동작

React 앱은 기존 메뉴와 데이터를 요청하기 전에 `GET /api/v1/auth/session`을 호출한다.

- 인증 비활성화 응답이면 기존 앱을 바로 표시한다.
- 인증 활성화 상태에서 유효한 세션이면 기존 앱과 헤더의 로그인 ID, 로그아웃 버튼을 표시한다.
- 세션이 없거나 만료되었으면 로그인 화면을 표시한다.
- 로그인 성공 후 세션 상태를 갱신하고 기존 앱으로 이동한다.
- 보호 API가 `401`을 반환하면 세션 상태를 다시 확인하고 로그인 화면으로 전환한다.
- 로그아웃 성공 후 사용자 상태와 이미 읽은 화면 데이터를 버리고 로그인 화면으로 전환한다.

비밀번호는 React state에 로그인 요청 동안만 존재하며 브라우저 저장소에 기록하지 않는다. 모든 인증 요청은 동일 출처의 `/api` 경로를 사용하므로 별도 CORS나 브라우저 접근 가능한 토큰은 필요하지 않다.

## 검증 전략

### 설정 단위 테스트

- 인증 기본 비활성화와 기존 설정 호환성
- 활성화 시 필수 설정과 URL 스킴 검증
- 직접 secret과 secret file의 배타성
- PEM CA, 세션 secret 길이, TTL 범위 검증
- 오류에 secret 값이 포함되지 않음

### LDAP 단위 및 통합 테스트

- LDAPS 연결과 LDAP+StartTLS 승격
- 인증서 검증과 선택 CA
- RFC 4515 escaping
- 검색 결과 0개, 1개, 복수
- 사용자 Bind 성공과 실패
- LDAP 장애와 자격증명 실패 분류
- 연결 정리와 비밀정보 비노출

LDAP 라이브러리는 얇은 클라이언트 인터페이스 뒤에 두어 대부분을 결정론적 fake로 검사한다. 실제 LDAP/AD 호환성은 테스트 컨테이너를 사용한 별도 통합 경로로 검증한다.

### DB 저장소 계약 테스트

같은 저장소 계약 테스트를 PostgreSQL과 MySQL에 적용한다.

- 세션 생성과 재조회
- API 인스턴스 재구성 뒤 조회
- 만료 세션 거부와 삭제
- 로그아웃 삭제
- 만료 세션 일괄 정리 상한
- 원본 세션 ID와 비밀번호가 저장되지 않음

### API 테스트

- health/ready와 인증 API의 공개 접근
- 모든 기존 업무 API의 보호
- 인증 비활성화 시 기존 무인증 테스트 유지
- 성공·실패 응답의 일반화
- IP와 로그인 ID rate limit
- 쿠키 속성과 로그아웃 만료
- Origin/Host 검사
- 서버 재시작 후 세션 유지

### 웹 테스트

- 인증 비활성화 시 기존 앱 렌더링
- 세션 확인 중 상태
- 로그인 성공과 일반화된 실패 메시지
- 새로고침 후 세션 복구
- 보호 API의 401 처리
- 로그아웃 후 민감한 화면 상태 제거

## 배포와 문서

Compose와 운영 문서에 LDAP URL, Bind DN, search base/filter, 세션 TTL을 추가하고 Bind 비밀번호, 세션 secret, 선택 CA의 read-only secret mount 예시를 제공한다. 인증 활성화 운영 예시는 HTTPS reverse proxy를 전제로 한다. LDAP 장애가 발생해도 서버가 인증을 자동 비활성화하거나 무인증 모드로 전환하지 않는다.

DB migration은 기존 배포 절차와 동일하게 API 기동 전에 명시적으로 적용한다. 두 DB용 migration이 동일한 논리 계약을 제공하는지 테스트한다.

## 범위 밖 후속 작업

- LDAP 그룹과 플랫폼 역할 매핑
- 담당 자산 기반 권한
- 복수 LDAP 디렉터리와 failover
- OIDC, SAML, 플랫폼 자체 계정
- 관리자 세션 조회와 강제 종료
- 다중 API 인스턴스용 공유 rate limit
- 디렉터리 사용자 프로필 또는 전체 목록 동기화
