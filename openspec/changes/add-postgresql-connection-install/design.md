## Context

#26은 `@oss-scp/platform-db`에 프레임워크 독립적인 설정 파서와 어댑터 수명주기 타입을 추가했지만 실제 어댑터를 등록하거나 API에서 설정을 소비하지 않는다. 현재 API의 `/api/v1/health`는 DB 없이 항상 정상 상태를 반환하고, Compose는 API·웹만 기본 실행한다. 자세한 동기는 [proposal.md](proposal.md), 관찰 가능한 계약은 [specs/postgresql-platform-db/spec.md](specs/postgresql-platform-db/spec.md)를 따른다.

## Goals / Non-Goals

**Goals:** 공통 계약의 첫 실제 어댑터를 PostgreSQL로 검증하고, API 시작·준비 상태·종료와 명시적 migration을 같은 연결 경계에 둔다. 내장 Compose DB와 외부 DB가 같은 설정·migration 경로를 사용하며 실제 DB 실패 조건을 자동 검증한다.

**Non-Goals:** 업무 테이블·repository·저장/조회 API, MySQL, DB 간 데이터 이전, 자동 schema 동기화, 원천 PostgreSQL connector, 운영 백업 도구는 포함하지 않는다. migration은 기반 이력 테이블과 검증용 초기 migration만 만들며 후속 업무 schema를 미리 설계하지 않는다.

## Decisions

1. `pg`의 `Pool`을 `packages/platform-db` 안의 PostgreSQL factory에서 감싼다. NestJS나 CLI는 `PlatformDbConnection`만 보고 드라이버 객체를 직접 받지 않는다. 별도 ORM은 후속 공통 storage-adapter의 물리 모델을 미리 고정하므로 도입하지 않는다. 풀 최대치는 `poolMax`, 연결과 readiness query에는 `connectTimeoutMs`를 적용한다.
2. TLS disable은 `ssl: false`, verify-full은 Node 기본 검증을 유지한 `ssl` 설정으로 변환한다. CA가 있으면 제공하되 `rejectUnauthorized: true`와 연결 host를 유지한다. 실패는 고정된 플랫폼 DB 연결 오류로 바꾸고 설정 객체·비밀번호·CA·드라이버 cause를 로그나 HTTP에 전달하지 않는다.
3. factory의 `connect`는 풀 생성 후 즉시 제한 시간 내 `SELECT 1`을 실행한다. 실패하면 반드시 `pool.end()` 후 오류를 반환한다. `checkReady`도 별도의 제한된 `SELECT 1`을 사용하며 실패는 `false`, `close`는 단일 종료 Promise를 공유하여 반복 호출 가능하게 한다.
4. API bootstrap이 환경변수를 읽어 고정 등록 목록 `[postgres]`에서 설정을 검증하고 DB 연결을 생성한 뒤 Nest 애플리케이션을 시작한다. 연결은 Nest provider로 주입하고 shutdown hook에서 닫는다. `/api/v1/health`는 liveness 호환 응답을 유지하고 `/api/v1/ready`를 추가해 성공 시 200, DB 실패 시 503을 반환한다. 테스트 모듈은 가짜 연결을 주입해 HTTP 계약을 격리하고 실제 bootstrap은 프로세스/통합 테스트에서 확인한다.
5. migration runner는 패키지에 포함된 `migrations/<4자리>-<name>.sql`을 정렬해 읽고 SHA-256 checksum을 계산한다. 고정 schema의 이력 테이블에는 version, name, checksum, applied_at을 기록한다. PostgreSQL advisory lock을 세션 단위로 잡고 각 파일을 `BEGIN`/SQL/INSERT/`COMMIT`으로 적용하며 실패 시 `ROLLBACK`한다. SQL 파일 자체의 transaction 문은 허용하지 않는 저장소 규칙으로 둔다. `node-pg-migrate`나 ORM migration 대신 작은 runner를 선택해 실행 계약과 감사 정보를 직접 통제한다.
6. CLI는 공통 환경 설정과 같은 PostgreSQL factory를 사용해 `pnpm db:migrate`로 실행한다. 애플리케이션 시작은 migration을 자동 적용하지 않으며, 미적용 migration이 있어도 연결과 readiness 자체는 성공할 수 있다. 후속 업무 schema가 요구되면 별도 schema readiness 계약을 추가한다.
7. 기본 `compose.yaml`은 PostgreSQL 서비스를 profile 없이 포함하고 API가 service health에 의존한다. DB 비밀번호는 Compose secret 파일을 기본 예시로 사용하고 API와 DB 컨테이너가 같은 파일을 읽는다. 이미 실행 중인 외부 DB 경로는 독립된 `compose.external-db.yaml`에 API·웹만 정의해 `docker compose -f compose.external-db.yaml up --build -d --wait`로 실행한다. 별도의 `PLATFORM_DB_MODE`는 두지 않는다. 선택은 진입점 자체로 드러내고 애플리케이션에는 두 경우 모두 같은 연결 설정만 전달한다. 외부 구성은 PostgreSQL 서비스·볼륨·DB 생명주기 명령을 포함하지 않는다. 일부 중복보다 서비스 삭제 semantics가 불명확한 override를 피하며 두 파일의 공통 앱 설정은 `docker compose config` 회귀 테스트로 맞춘다.
8. Testcontainers PostgreSQL로 연결·인증·접속 종료와 migration 계약을 검증한다. TLS 실패는 비신뢰 인증서를 제시하는 PostgreSQL fixture 또는 별도 TLS 테스트 컨테이너로 실제 handshake를 확인한다. Compose 테스트는 고유 project name과 임시 secret을 사용하고 named volume을 삭제하지 않은 `down`/재기동 후 migration 이력을 확인한 다음 테스트가 만든 리소스만 정리한다.
9. 최초 지원 기준은 구현 시 공식 지원 중인 PostgreSQL 이미지 한 버전과 잠금된 `pg` 버전을 선택해 macOS 로컬과 Ubuntu CI에서 실제 검증한 결과로 고정한다. 검증하지 않은 PostgreSQL 버전에 대한 호환성을 주장하지 않는다.

## Risks / Trade-offs

- [기본 Compose에 DB 추가로 기존 무설정 실행이 중단됨] → `.env.example`과 빠른 시작에서 secret 생성부터 안내하고 프로세스 테스트를 새 필수 설정에 맞춘다.
- [readiness 요청마다 DB query 비용 발생] → 단일 `SELECT 1`과 timeout만 사용하고 캐시는 실제 부하 측정 전 추가하지 않는다.
- [SQL 분리 파서 없이 파일 전체를 실행] → 한 migration을 한 query/transaction으로 보내며 파일 작성 규칙을 문서화한다. 복잡한 문장 분리는 드라이버에 맡긴다.
- [advisory lock 대기 무제한] → 연결 timeout과 별도의 제한된 lock 획득을 사용하고 실패 시 migration을 시작하지 않는다.
- [Compose 파일 분리 방식이 기존 개발 override에 영향] → `docker compose config`와 기존 workspace 격리 검사를 함께 실행해 서비스·볼륨·마운트 구성을 회귀 검증한다.
- [두 Compose 진입점의 공통 API·웹 설정이 어긋날 수 있음] → 두 렌더링 결과의 공통 필드를 자동 비교하고 외부 구성에 DB 서비스·볼륨이 없음을 회귀 검사한다.
- [Testcontainers와 TLS fixture로 CI 시간이 증가] → 실제 DB 검증을 별도 CI job으로 격리하고 고정 image를 사용한다.

## Migration Plan

최신 main에서 새 패키지 코드를 추가한 뒤 migration CLI를 빈 PostgreSQL에 적용한다. 배포자는 새 버전의 API를 시작하기 전에 명시적으로 migration 명령을 실행한다. 이번 변경에는 업무 데이터가 없으므로 코드 rollback 시 API를 이전 버전으로 되돌릴 수 있으며, migration 이력 기반 테이블은 후속 재시도를 위해 남긴다. 자동 down migration이나 DB 삭제는 제공하지 않는다.
