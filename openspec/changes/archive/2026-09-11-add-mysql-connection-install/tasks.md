## 1. 기준 브랜치와 MySQL 어댑터

- [x] 1.1 최신 `main`의 독립 `codex/issue-28-mysql` 작업 환경에 이 change를 옮기고 현재 dirty 작업 트리를 보존한다. #26·#27 파일과 OpenSpec 산출물이 존재하며 `pnpm install --frozen-lockfile`과 기존 PostgreSQL 패키지 테스트가 통과하는지 확인한다.
- [x] 1.2 검증할 MySQL Docker 이미지와 `mysql2` 버전을 고정해 패키지·잠금 파일에 추가하고 Node.js 24에서 패키지 빌드와 타입 검사가 통과하는지 확인한다.
- [x] 1.3 공통 설정을 MySQL pool 옵션으로 변환하는 `mysql` factory를 구현한다. 기본 포트 3306, 풀 크기·timeout·TLS disable/verify-full/CA와 비밀번호·CA·원본 오류 미노출을 단위 테스트로 검증한다.
- [x] 1.4 최초 `SELECT 1`, readiness, 종료 후 작업 거부, 반복 가능한 close와 연결 실패 시 풀 정리를 구현한다. 실제 MySQL에서 정상 연결·잘못된 인증·접속 불가·종료를 통합 테스트한다.
- [x] 1.5 테스트 CA와 서버 인증서를 사용하는 실제 TLS MySQL fixture를 구성해 신뢰한 CA 연결 성공, 비신뢰 CA와 호스트명 불일치 실패 및 평문 자동 전환 금지를 통합 테스트한다.

## 2. 제품 선택과 API 수명주기

- [x] 2.1 API와 공통 소비 코드가 고정 등록 목록에서 설정된 어댑터를 선택하도록 PostgreSQL 직접 참조를 제거한다. 가짜 어댑터 단위 테스트와 PostgreSQL/MySQL 실제 프로세스 테스트로 선택한 DB에만 연결하고 listen 전 실패·종료 정리가 동작하는지 검증한다.
- [x] 2.2 기존 `/api/v1/health`와 `/api/v1/ready` 응답을 유지하며 MySQL 실행 중 장애가 liveness 성공/readiness 503으로 나타나는지 확인하고, HTTP와 로그에 제품별 드라이버 오류나 비밀정보가 없는지 회귀 테스트한다.

## 3. 제품별 migration 실행

- [x] 3.1 migration discovery와 checksum 규칙을 공통으로 유지하면서 내장 파일을 `migrations/postgres`와 `migrations/mysql`로 분리하고 DB 종류에 맞는 디렉터리만 선택한다. 기존 PostgreSQL checksum·최초 적용·재실행 테스트와 MySQL 파일 선택 단위 테스트를 통과시킨다.
- [x] 3.2 제품별 실행 backend 경계를 도입해 기존 PostgreSQL advisory lock·transaction 동작을 보존하고, 공통 CLI가 선택 어댑터와 backend를 함께 사용하도록 구현한다. PostgreSQL migration 회귀 및 잘못된 제품/조합의 비밀정보 없는 실패를 검증한다.
- [x] 3.3 MySQL 전용 연결에서 제한 시간 있는 `GET_LOCK`/`RELEASE_LOCK`, migration 이력 테이블, 성공 후 이력 기록과 실패 중단을 구현한다. 실제 MySQL에서 최초 적용·재실행 무변경·checksum 불일치·잠금 경합·실패 버전 미기록·후속 미실행을 검증한다.
- [x] 3.4 `pnpm db:migrate`와 컨테이너 migration 명령을 PostgreSQL과 MySQL 각각 실행해 올바른 제품 디렉터리만 적용되고 성공 건수·실패 종료 코드·출력에 비밀정보가 없는지 프로세스 테스트한다.

## 4. MySQL 설치 경로

- [x] 4.1 `compose.mysql.yaml`에 고정 MySQL 서비스·healthcheck·분리된 영속 볼륨·application/root secret과 API 준비 순서를 추가한다. `docker compose config` 검사로 PostgreSQL 서비스/볼륨 부재, 비밀정보 비내장, API의 `PLATFORM_DB_TYPE=mysql`을 확인한다.
- [x] 4.2 DB 서비스·볼륨이 없는 `compose.external-db.mysql.yaml`과 비밀번호 파일용 secret 구성을 추가한다. 실제 외부 테스트 MySQL을 대상으로 API·migration이 해당 DB에만 연결하고 그 컨테이너를 생성·기동·종료·삭제하지 않는지 검증한다.
- [x] 4.3 고유 Compose 프로젝트와 임시 secret으로 MySQL 내장 설치를 시작하고 migration 이력 값을 기록한 뒤 DB 컨테이너를 재생성해 값이 유지되는지 검증한다. 테스트 종료 시 테스트가 만든 컨테이너·네트워크·볼륨·secret만 정리한다.
- [x] 4.4 기존 Compose 정적 검사, Docker workspace/dev/web/mock 테스트를 새 진입점에 맞게 확장하고 기본 `compose.yaml`의 PostgreSQL 설치와 외부 PostgreSQL 경로가 변경 없이 통과하는지 확인한다.

## 5. 문서와 전체 검증

- [x] 5.1 `.env.example`, `docs/platform-db.md`, 서버 가이드와 README에 MySQL 내장/외부 실행 명령, 검증한 버전, application/root 비밀번호 구분, 지원 인증 방식, TLS CA, 전용 DB·최소 migration 권한, MySQL DDL 실패의 전진 복구 규칙을 문서화하고 비밀정보 없는 예시를 자동 설정/Compose 검사와 대조한다.
- [x] 5.2 GitHub Actions에 격리된 MySQL 실제 DB job을 추가하면서 PostgreSQL job을 유지한다. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, PostgreSQL/MySQL 프로세스·Docker 통합 테스트와 `openspec validate add-mysql-connection-install --strict`를 깨끗한 환경에서 실행해 결과를 기록한다.
