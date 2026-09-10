## Why

PostgreSQL과 같은 공통 설정·상태·migration 계약으로 MySQL을 선택할 수 있어야 서비스 운영 DB가 특정 제품에 고정되지 않는다. #26의 공통 설정 계약과 #27의 첫 실제 연결 기반이 준비되었으므로, 이제 두 번째 제품을 실제 설치·외부 연결 경로에서 검증해 DB별 차이가 업무 코드로 새지 않는지 확인한다.

## What Changes

- `mysql` 플랫폼 DB 어댑터를 등록하고 제한된 연결 풀, 연결 timeout, TLS `verify-full`, readiness 검사와 반복 가능한 정상 종료를 구현한다.
- API와 migration CLI의 고정 어댑터 등록 목록에 MySQL을 추가해 `PLATFORM_DB_TYPE=mysql`을 같은 시작 실패·liveness/readiness 계약으로 처리한다.
- PostgreSQL에서 마련한 순번·checksum·명시적 실행 규칙을 재사용하되, MySQL 전용 migration 이력·잠금·트랜잭션 처리를 구현한다. 업무 테이블과 저장·조회는 포함하지 않는다.
- 영속 볼륨이 있는 MySQL 내장 Compose 진입점과, 이미 실행 중인 외부 MySQL에 API·웹만 연결하는 진입점을 제공한다. 비밀번호 값/파일, TLS CA, DB·전용 계정 준비를 같은 공통 설정으로 전달한다.
- 실제 MySQL 통합 테스트로 정상 연결, 인증·접속·TLS 실패, 종료, migration 최초 실행·재실행·실패 및 컨테이너 재생성 후 영속성을 검증한다.
- 검증한 MySQL·드라이버 버전, 내장/외부 설치, 계정·권한, TLS와 migration 절차를 문서화하고 기존 PostgreSQL 경로의 회귀를 검증한다.
- DB 제품 간 데이터 이전, MySQL 업무 테이블·upsert·조회, 원천 MySQL connector는 포함하지 않는다.

## Capabilities

### New Capabilities

- `mysql-platform-db`: MySQL 플랫폼 DB의 연결 수명주기, 공통 API readiness, 제품별 migration 실행 및 내장/외부 설치 계약을 정의한다.

### Modified Capabilities

없음. 기존 `platform-db-config`와 `postgresql-platform-db` 요구사항을 변경하지 않고 두 번째 공통 계약 소비자를 추가한다.

## Impact

`packages/platform-db`, `apps/api`, Compose 설치 파일과 검사 스크립트, `.env.example`, 플랫폼 DB·서버 문서 및 CI가 변경된다. MySQL 드라이버와 실제 DB 통합 테스트 의존성이 추가되며, 기본 PostgreSQL 설치는 그대로 유지하고 MySQL은 명시적인 별도 Compose 진입점으로 선택한다. API의 기존 health/readiness 경로와 migration 명령은 DB 제품에 관계없이 같은 외부 계약을 유지한다.
