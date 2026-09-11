## Context

동기와 범위는 [proposal.md](proposal.md)를 따른다. 기준 구현은 `origin/main`의 #26·#27 결과다. `@oss-scp/platform-db`는 공통 설정과 `PlatformDbAdapterFactory`를 제공하지만 실제 등록·API bootstrap·migration CLI는 PostgreSQL에 고정되어 있다. PostgreSQL runner는 세션 advisory lock과 트랜잭션을 사용하며, 기본 `compose.yaml`과 외부 DB Compose도 PostgreSQL 전용이다. 관찰 가능한 MySQL 계약은 [specs/mysql-platform-db/spec.md](specs/mysql-platform-db/spec.md)를 따른다.

현재 작업 트리는 선행 플러그인 변경이 섞인 오래된 브랜치이므로 구현은 최신 `main`에서 격리해 이 change만 적용해야 한다. Node.js 24 LTS, pnpm workspace, Ubuntu 24.04 CI와 macOS 로컬 검증 범위는 유지한다.

## Goals / Non-Goals

**Goals:** MySQL을 공통 어댑터 등록·API 상태·명시적 migration 경계의 두 번째 구현으로 추가한다. PostgreSQL 기본 설치는 유지하면서 MySQL 내장/외부 설치를 명시적으로 선택하게 하고, 실제 두 제품 테스트로 공통 코드와 제품별 코드를 분리한다.

**Non-Goals:** 업무 테이블·upsert·조회 adapter, PostgreSQL/MySQL 간 데이터 이전, 원천 MySQL connector, 자동 schema 동기화, down migration, Kubernetes/Helm과 운영 백업은 포함하지 않는다. MySQL 호환 모드인 MariaDB나 검증하지 않은 MySQL 버전도 지원 대상으로 주장하지 않는다.

## Decisions

1. `mysql2`의 Promise pool을 `packages/platform-db` 내부 `mysqlAdapter`에서 감싼다. `mysql2`는 풀·prepared query·TypeScript 타입을 함께 제공해 별도 타입 패키지가 필요 없고 Node.js 24에서 널리 검증 가능하다. ORM 도입은 후속 storage-adapter의 물리 모델을 미리 고정하므로 선택하지 않는다. 실제 구현 시 공식 지원 중인 MySQL 이미지와 잠금된 드라이버 버전을 통합 테스트한 뒤 문서에 정확히 기록한다.
2. API와 CLI는 고정 배열 `[postgresAdapter, mysqlAdapter]`에서 `readPlatformDbConfig`와 `selectPlatformDbAdapter`로 하나를 선택한다. 현재처럼 PostgreSQL 객체를 직접 호출하는 분기는 제거하되, Nest provider와 health controller는 기존 `PlatformDbConnection`만 사용한다. 제품 선택을 요청 값이나 원천 Connection에서 받지 않으며 빌드에 포함된 등록만 허용한다.
3. MySQL pool 옵션은 공통 `host`, `port`, `database`, `user`, `password`, `poolMax`, `connectTimeoutMs`만 변환한다. readiness query는 `SELECT 1`이고, 최초 검사 실패 시 풀을 끝낸 뒤 고정된 `PlatformDbConnectionError`를 반환한다. `close`는 단일 Promise를 공유해 반복 호출 가능하게 하고 종료 후 새 작업을 거부한다. TLS disable은 `ssl`을 사용하지 않고, verify-full은 `rejectUnauthorized: true`와 선택 CA를 사용한다. 인증서 체인뿐 아니라 설정 host와 인증서 이름 불일치도 실제 TLS fixture로 검증하며 실패 시 평문 재시도를 하지 않는다.
4. migration 파일 discovery, 파일명, 순서, checksum, 오류 타입과 CLI 출력은 공통으로 유지한다. 실행 부분은 제품별 `MigrationBackend` 경계로 분리한다. PostgreSQL은 기존 advisory lock/transaction 동작을 보존하고 MySQL은 동일 전용 연결에서 `GET_LOCK`/`RELEASE_LOCK`, 이력 테이블과 `?` 바인딩을 사용한다. 잠금 결과가 1이 아니거나 제한 시간 내 획득하지 못하면 실행하지 않는다.
5. MySQL DDL은 암묵적 commit이 발생할 수 있어 PostgreSQL과 같은 rollback 보장을 가장하지 않는다. 각 파일의 SQL이 성공한 뒤 같은 버전의 이력을 기록하고, 실패 시 이력을 남기지 않은 채 중단한다. connection 전체의 injection 위험을 키우는 다중 statement 옵션을 사용하지 않고 MySQL migration 파일 하나에 statement 하나만 허용한다. 작성 규칙은 가능한 `IF NOT EXISTS` 등 재실행 가능한 전진 변경과 수동 복구 절차를 요구한다. 기존 baseline을 `migrations/postgres`로 옮기고 동일 버전의 MySQL baseline을 `migrations/mysql`에 두어 제품별 디렉터리를 명시적으로 선택한다. SQL 방언이 다른 업무 schema를 억지로 공용 파일에 넣지 않는다.
6. 기본 `compose.yaml`은 PostgreSQL 빠른 시작으로 유지한다. MySQL 내장 설치는 독립 `compose.mysql.yaml`, 외부 MySQL은 DB 서비스·볼륨이 없는 `compose.external-db.mysql.yaml`을 사용한다. 두 파일 모두 기존 API·웹 이미지와 공통 환경 이름을 사용하고 `PLATFORM_DB_TYPE=mysql`을 명시한다. 이 선택은 별도 mode 변수보다 실행 명령에서 명확하며, Compose override로 서비스 삭제를 표현할 때 생기는 수명주기 혼동을 피한다. MySQL 데이터 볼륨은 PostgreSQL 볼륨과 다른 이름을 사용한다.
7. 내장 MySQL 초기화 변수는 전용 application 계정과 DB를 만들되 root 비밀번호도 별도 secret으로 받는다. 애플리케이션 계정에는 대상 DB 연결과 migration에 필요한 최소 DDL/DML 권한만 안내하며 전역 관리자 권한을 부여하지 않는다. 지원 인증 plugin은 선택한 MySQL 이미지의 기본값을 실제 드라이버로 검증하고, 레거시 인증으로 자동 하향하지 않는다. 외부 DB의 생성·삭제와 root 자격증명은 API에 전달하지 않는다.
8. Testcontainers 또는 저장소의 기존 Docker 테스트 패턴으로 실제 MySQL 연결·인증·접속 불가·정상 종료·migration을 검증한다. TLS는 테스트 전용 CA와 서버 인증서를 가진 MySQL fixture로 신뢰 성공, 비신뢰 CA, 호스트명 불일치를 확인한다. Compose 테스트는 고유 project name과 임시 secret을 사용하고 DB 컨테이너 재생성 전후 이력 행을 확인한 뒤 테스트가 만든 리소스만 정리한다. PostgreSQL 전용 job은 유지하고 MySQL job을 분리해 실패 원인을 격리한다.
9. `docs/platform-db.md`는 제품 공통 설정을 한 번만 설명하고, PostgreSQL/MySQL별 내장·외부 명령, 지원 버전, 계정·권한, TLS 주의점을 나눈다. `.env.example`에는 비밀값을 넣지 않는다. Compose 정적 검사로 MySQL 내장 경로에 PostgreSQL 서비스/볼륨이 없고 외부 경로에 어떤 DB 서비스/볼륨도 없으며 API·웹 공통 필드가 어긋나지 않는지 검증한다.

## Risks / Trade-offs

- [MySQL DDL 실패는 transaction rollback으로 원상 복구되지 않을 수 있음] → 적용 이력은 성공 후에만 기록하고 migration을 재실행 가능한 전진 변경으로 제한하며 실패 시 후속 실행을 중단하고 복구 절차를 문서화한다.
- [드라이버의 TLS 옵션이 체인만 검증하고 호스트명을 놓칠 가능성] → 신뢰 CA의 다른 호스트 인증서를 사용한 실제 handshake 테스트를 필수로 두고, 필요하면 명시적 서버 신원 검사 콜백을 연결한다.
- [Compose 진입점 증가로 공통 API·웹 설정이 어긋날 수 있음] → 렌더링된 Compose 설정을 자동 비교하고 제품별 DB 서비스·볼륨 소유 범위를 검사한다.
- [MySQL 초기화 root secret과 application secret이 혼동될 수 있음] → 이름과 mount 대상을 분리하고 API에는 application secret만 전달하며 두 값을 Git/이미지에 포함하지 않는다.
- [두 실제 DB 제품 테스트로 CI 시간이 증가] → 제품별 job을 병렬 격리하고 고정 이미지를 사용하며 전체 Docker smoke는 필요한 계약만 검사한다.
- [현재 dirty branch가 최신 #27 코드를 포함하지 않음] → 구현은 최신 `main`의 새 worktree/브랜치에서 수행하고 현재 미커밋 파일을 이동·삭제하지 않는다.

## Migration Plan

최신 `main`에서 MySQL 드라이버와 어댑터를 추가하고 공통 선택 경계를 먼저 전환하되 PostgreSQL 테스트를 통과시킨다. 다음으로 MySQL migration backend와 제품별 migration 경로, 내장/외부 Compose 및 문서를 추가한다. 배포자는 선택한 MySQL DB와 전용 계정을 준비하고 API 시작 전에 명시적 migration 명령을 실행한다.

이번 변경에는 업무 데이터가 없고 기본 PostgreSQL 설치를 변경하지 않는다. 코드 rollback은 API와 CLI 등록에서 MySQL을 제거하고 MySQL용 Compose·문서를 되돌리는 방식으로 가능하다. 이미 만든 MySQL migration 이력은 재시도를 위해 남기며 자동 DB/볼륨 삭제나 down migration은 제공하지 않는다. 실패한 MySQL DDL이 남았다면 문서화된 migration별 전진 복구를 수행한 뒤 같은 버전을 재실행한다.
