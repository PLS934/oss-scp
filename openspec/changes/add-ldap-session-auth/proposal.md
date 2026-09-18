## Why

현재 플랫폼은 모든 웹 화면과 API를 익명으로 제공하므로 조직의 LDAP 또는 Active Directory 계정으로 접근자를 확인해야 하는 운영 환경에 배포할 수 없다. 계정관리 기능을 선택적으로 활성화해 기존 설치의 무인증 동작을 보존하면서 안전한 로그인과 재시작에도 유지되는 서버 세션을 제공해야 한다.

## What Changes

- 단일 LDAP/AD 디렉터리에서 서비스 계정 검색 후 사용자 DN Bind로 자격증명을 검증한다.
- LDAPS와 LDAP 연결 후 필수 StartTLS를 지원하고 서버 인증서 검증과 선택적 사내 CA 주입을 적용한다.
- PostgreSQL과 MySQL에 해시된 세션 식별자, 사용자 식별자, 생성·만료 시각만 저장하는 공통 세션 계약을 추가한다.
- 로그인, 로그아웃, 현재 세션 API와 인증 활성화 시 기존 업무 API를 보호하는 전역 인증 경계를 추가한다.
- health와 ready API는 인증 활성화 상태에서도 익명 호출을 유지한다.
- 로그인 IP와 로그인 ID별 rate limit, LDAP 검색 입력 escaping, 일반화된 인증 실패 응답, 안전한 세션 쿠키를 적용한다.
- React 앱에 세션 복구, 로그인 화면, 현재 사용자 표시, 로그아웃 흐름을 추가한다.
- `AUTH_ENABLED=false` 기본값에서는 LDAP 설정 없이 기존 웹과 API를 그대로 사용할 수 있게 한다.
- LDAP 그룹 역할 매핑, 복수 디렉터리, SAML/OIDC, 자체 비밀번호 계정, 사용자 전체 동기화와 관리자 세션 화면은 제외한다.

## Capabilities

### New Capabilities

- `ldap-session-auth`: 선택적 LDAP/AD 인증, DB 기반 세션, API 보호, 로그인 웹 흐름과 관련 보안 계약을 정의한다.

### Modified Capabilities

- 없음.

## Impact

- `apps/api`: 인증 설정, LDAP 제공자, 세션 서비스, 인증 API와 전역 guard가 추가되며 LDAP 클라이언트와 쿠키 처리 의존성이 생긴다.
- `packages/platform-db`: PostgreSQL/MySQL 세션 migration과 DB별 세션 저장소 adapter가 추가된다.
- `apps/web`: 앱 bootstrap 전에 세션을 확인하고 로그인·로그아웃 상태를 관리하는 화면과 API client가 추가된다.
- `compose.yaml`과 운영 문서: LDAP 연결, secret file, 선택 CA와 HTTPS 배포 설정이 추가된다.
- 기존 API는 인증 활성화 시 로그인 세션을 요구하지만 기본 비활성화 상태의 호환성은 유지한다.
