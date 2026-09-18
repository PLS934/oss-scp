## 1. 인증 설정과 LDAP 제공자

- [ ] 1.1 `apps/api`에 LDAP client 의존성을 추가하고 lockfile을 갱신해 `pnpm install --frozen-lockfile`과 API build가 성공하는지 확인한다.
- [ ] 1.2 인증 활성화, LDAP URL·Bind·검색·ID 속성, secret direct/file, CA와 세션 TTL 설정 parser를 구현하고 기본 비활성화·필수값·충돌·형식·비밀값 비노출 단위 테스트를 통과시킨다.
- [ ] 1.3 RFC 4515 로그인 값 escaping과 검색 filter template 검증을 구현하고 wildcard, 괄호, backslash, NUL 및 제어문자 회귀 테스트를 통과시킨다.
- [ ] 1.4 LDAPS와 LDAP+필수 StartTLS 연결 adapter를 구현하고 fake client 테스트에서 TLS 전 Bind 금지, 인증서 검증 강제, 선택 CA, 연결 정리가 확인되게 한다.
- [ ] 1.5 서비스 Bind 검색 후 단일 사용자 DN Bind와 안정적 ID 속성 정규화를 구현하고 0/1/복수 검색, binary ID, 사용자 Bind 실패, 디렉터리 장애 분류 테스트를 통과시킨다.

## 2. 플랫폼 DB 세션 저장소

- [ ] 2.1 PostgreSQL과 MySQL에 동등한 `auth_sessions` migration과 만료 조회용 index를 추가하고 migration 발견·적용 테스트에서 새 버전이 성공적으로 적용되는지 확인한다.
- [ ] 2.2 `packages/platform-db`에 공통 session repository 계약과 PostgreSQL 구현을 추가하고 생성, 유효 조회, 만료 거부·삭제, 로그아웃 삭제, 제한적 정리 계약 테스트를 통과시킨다.
- [ ] 2.3 같은 session repository 계약의 MySQL 구현을 추가하고 PostgreSQL과 동일한 계약 테스트 및 MySQL package test를 통과시킨다.

## 3. API 세션과 보호 경계

- [ ] 3.1 32-byte 무작위 세션 ID, HMAC-SHA-256 DB key, absolute TTL과 엄격한 쿠키 parsing/serialization을 구현하고 원본 비저장 및 개발·운영 쿠키 속성 단위 테스트를 통과시킨다.
- [ ] 3.2 IP와 HMAC 처리한 로그인 ID별 고정 시간창 rate limiter를 구현하고 제한, `Retry-After`, 성공 초기화, bucket 만료와 원문 ID 비저장 테스트를 통과시킨다.
- [ ] 3.3 현재 세션, 로그인, 멱등 로그아웃 controller/service를 구현하고 성공·일반화된 401·LDAP 503·429·만료 쿠키 응답 계약 테스트를 통과시킨다.
- [ ] 3.4 allowlist 기반 전역 인증 guard와 쿠키 인증 상태 변경 요청의 Origin/Host 검사를 구현하고 health/ready/auth 공개, 업무 API 보호, 교차 출처 거부 테스트를 통과시킨다.
- [ ] 3.5 인증 구성과 DB 종류에 맞는 세션 repository를 `main.ts`와 `AppModule` DI에 연결하고 `AUTH_ENABLED=false`에서 기존 API test suite가 변경 없이 통과하는지 확인한다.
- [ ] 3.6 테스트 DB에서 세션을 생성한 뒤 Nest 앱을 닫고 새 앱 인스턴스로 같은 쿠키를 조회하는 PostgreSQL·MySQL 통합 테스트를 추가해 재시작 유지와 로그아웃 폐기를 검증한다.

## 4. 웹 인증 흐름

- [ ] 4.1 `apps/web`에 session 조회, login, logout API client와 `unknown/disabled/anonymous/authenticated` 상태 관리를 추가하고 응답 검증·오류 일반화 단위 테스트를 통과시킨다.
- [ ] 4.2 로그인 화면을 구현하고 anonymous 상태에서 기존 앱과 menu/data 요청이 시작되지 않으며 로그인 성공 뒤 앱이 mount되는 component 테스트를 통과시킨다.
- [ ] 4.3 기존 앱 헤더에 현재 로그인 ID와 로그아웃 동작을 추가하고 로그아웃 시 화면 상태 폐기, 새로고침 세션 복구, 보호 API 401 재확인 테스트를 통과시킨다.
- [ ] 4.4 인증 비활성화 상태에서는 로그인 UI 없이 기존 앱이 렌더링되고 기존 web test suite와 build가 통과하는지 확인한다.

## 5. 배포, 문서와 종합 검증

- [ ] 5.1 Compose와 환경변수 예시에 LDAP/StartTLS, Bind secret, session secret, 선택 CA read-only mount를 추가하고 `docker compose config`로 비활성화 기본 구성이 유효한지 확인한다.
- [ ] 5.2 서버·클라이언트 운영 문서에 두 TLS 방식, ID 속성 예시, migration 순서, HTTPS/Secure cookie, 장애 시 fail-closed와 제외 범위를 기록하고 문서 링크 검사를 수행한다.
- [ ] 5.3 실제 LDAP test container로 LDAPS와 LDAP+StartTLS 로그인, 잘못된 비밀번호, filter escaping, CA 실패를 검증하는 통합 테스트를 추가하고 로컬 재현 명령을 문서화한다.
- [ ] 5.4 `pnpm lint`, `pnpm typecheck`, 영향 패키지 테스트와 build, PostgreSQL·MySQL 인증 통합 테스트를 실행하고 모두 성공한 결과를 기록한다.
- [ ] 5.5 `openspec validate add-ldap-session-auth --strict`를 실행해 proposal, spec, design과 완료된 작업이 일치하는지 확인한다.
