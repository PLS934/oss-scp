## Why

설치자는 플랫폼 운영 DB를 직접 준비하지 않고도 PostgreSQL과 함께 oss-scp를 시작하거나, 조직이 운영하는 외부 PostgreSQL에 안전하게 연결할 수 있어야 한다. #26에서 확정한 공통 설정 계약을 실제 연결·준비 상태·종료·migration 및 설치 경로로 이어 Phase 0 저장 작업의 기반을 마련한다.

## What Changes

- `postgres` 플랫폼 DB 어댑터를 등록하고 제한된 연결 풀, 연결 timeout, TLS `verify-full`, readiness 검사와 반복 가능한 정상 종료를 구현한다.
- API 시작 과정이 플랫폼 DB 설정과 최초 연결을 필수로 검증하고, liveness와 DB readiness를 분리해 보고하도록 변경한다.
- 순번이 붙은 SQL 파일과 migration 이력 테이블을 사용하는 명시적 migration CLI를 제공한다. 최초 적용, 재실행, 잠금, 실패 rollback을 지원하며 앱 시작 시 자동 schema 동기화는 하지 않는다.
- 기본 Compose 설치에 영속 볼륨을 가진 PostgreSQL을 포함하고, 외부 DB 사용 시 내장 DB를 실행하지 않는 경로와 환경변수/secret 파일 전달을 제공한다.
- 실제 PostgreSQL 통합 테스트로 정상 연결, 인증·접속·TLS 실패, 자원 정리, migration 재실행·실패 및 Compose 데이터 유지를 검증한다.
- 빠른 시작과 외부 DB의 DB·전용 계정·TLS·migration 권한 준비 방법을 문서화한다.
- 업무 테이블과 저장·조회, MySQL, DB 제품 간 이전, 원천 PostgreSQL connector는 포함하지 않는다.

## Capabilities

### New Capabilities

- `postgresql-platform-db`: PostgreSQL 플랫폼 DB의 연결 수명주기, API readiness, migration 실행 및 내장/외부 설치 계약을 정의한다.

### Modified Capabilities

없음. #26의 `platform-db-config` 계약은 변경하지 않고 실제 PostgreSQL 소비자로 구현한다.

## Impact

`packages/platform-db`, `apps/api`, Compose 파일, DB/migration 실행 스크립트, `.env.example`, 서버·설치 문서와 CI가 변경된다. 런타임 의존성으로 `pg`, 개발·통합 테스트 의존성으로 Testcontainers 계열 패키지가 추가되며 기본 Compose 실행에는 PostgreSQL 서비스와 영속 볼륨이 추가된다. API는 더 이상 DB 설정 없이 시작하지 않으므로 배포 설정에 영향을 주지만 liveness 경로는 DB 장애와 독립적으로 유지한다.
