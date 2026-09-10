## 1. PostgreSQL 어댑터와 실제 DB 검증

- [x] 1.1 `pg`와 Testcontainers 의존성 및 고정 PostgreSQL 테스트 이미지를 추가하고 frozen-lockfile 설치·패키지 빌드로 구성을 검증한다.
- [x] 1.2 공통 설정을 `pg.Pool` 옵션으로 안전하게 변환하는 `postgres` factory를 구현하고 풀 크기·timeout·TLS disable/verify-full/CA·비밀정보 미노출을 단위 테스트로 검증한다.
- [x] 1.3 최초 `SELECT 1`, readiness, 반복 가능한 close와 실패 시 풀 정리를 구현하고 실제 PostgreSQL에서 정상 연결·잘못된 인증·접속 불가·종료를 통합 테스트한다.
- [x] 1.4 비신뢰 인증서/호스트 조건의 실제 TLS PostgreSQL fixture를 구성해 verify-full 실패와 평문 자동 전환 금지를 통합 테스트한다.

## 2. Migration 기반

- [x] 2.1 순번·이름 규칙의 내장 SQL discovery, 중복 검사와 SHA-256 checksum 계산을 구현하고 파일 순서·중복·변경 검출 단위 테스트를 추가한다.
- [x] 2.2 migration 이력 테이블, 제한된 advisory lock, migration별 transaction·rollback과 이력 기록을 구현한다. 실제 PostgreSQL에서 최초 적용·재실행 무변경·checksum 불일치·실패 rollback·동시 실행을 검증한다.
- [x] 2.3 공통 환경 설정과 PostgreSQL 어댑터를 사용하는 `pnpm db:migrate` CLI를 추가하고 성공·설정/연결/migration 실패 종료 코드와 비밀정보 없는 출력을 프로세스 테스트로 확인한다.

## 3. API 수명주기와 상태

- [x] 3.1 API bootstrap에 PostgreSQL 설정·최초 연결과 Nest 종료 provider를 연결하고, 설정/인증/접속 실패 시 listen 이전 종료 및 정상 종료 시 풀 정리를 프로세스 테스트로 검증한다.
- [x] 3.2 기존 `/api/v1/health` liveness 응답을 유지하고 `/api/v1/ready`에 DB readiness 200/503 계약을 추가해 가짜 연결 HTTP 테스트와 실제 DB 프로세스 테스트를 통과시킨다.

## 4. Compose 설치 경로

- [x] 4.1 기본 `compose.yaml`에 고정 PostgreSQL 서비스·healthcheck·전용 DB/계정·명명된 볼륨·secret 파일을 추가하고 API 준비 순서를 `docker compose config`와 함께 설치 smoke test로 검증한다.
- [x] 4.2 별도 모드 변수 없이 PostgreSQL 서비스·볼륨을 포함하지 않는 독립 `compose.external-db.yaml`을 추가한다. 실제 외부 테스트 컨테이너를 대상으로 API·migration이 이미 실행 중인 외부 DB에만 연결하고 그 컨테이너를 생성·기동·종료·삭제하지 않는지 검증한다.
- [x] 4.3 고유 Compose 프로젝트에서 migration 이력 값을 기록하고 DB 컨테이너만 재생성한 뒤 값이 유지되는지 자동 검증하며 테스트가 생성한 컨테이너·네트워크·볼륨·secret만 정리한다.
- [x] 4.4 `compose.dev.yaml`, Docker workspace 볼륨 목록과 기존 Docker/웹/mock 테스트를 PostgreSQL 기본 의존성에 맞게 갱신하고 개발 watch 및 workspace 격리 회귀 검사를 통과시킨다.

## 5. 문서와 전체 검증

- [x] 5.1 `.env.example`, 빠른 시작, `docs/platform-db.md`와 서버 가이드에 기본 `docker compose up` 내장 DB 경로와 `docker compose -f compose.external-db.yaml up` 외부 DB 경로, 외부 DB 생명주기 비관리, 직접 비밀번호/secret 파일, TLS, 전용 계정·DB·migration 권한, 명시적 migration 및 검증한 버전을 문서화하고 예시를 자동 설정 검사와 대조한다.
- [x] 5.2 PostgreSQL 통합 검증을 GitHub Actions의 격리된 job에 추가하고 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, 프로세스·Docker 테스트와 `openspec validate add-postgresql-connection-install --strict`를 실행해 결과를 기록한다.
