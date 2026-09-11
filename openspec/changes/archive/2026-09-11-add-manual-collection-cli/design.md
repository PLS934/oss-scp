## Context

제안 배경은 [proposal.md](./proposal.md)를 따른다. 현재 `@oss-scp/plugin-config`는 repository 전체를 검증해 실행 가능한 수집 정의를 만들고, `@oss-scp/http-collector`와 local CSV source는 제한된 묶음을 제공한다. `@oss-scp/collection-engine`의 runner는 transform과 `RecordStorage`를 조합하지만 CLI 조립 책임은 갖지 않는다. 플랫폼 DB 설정은 환경변수와 password/password-file 상호 배타 계약을 이미 제공하고, PostgreSQL만 현재 `RecordStorage` 구현을 제공한다. MySQL은 연결·migration adapter는 있으나 공통 레코드 저장 구현이 아직 없다.

API 배포 이미지는 현재 API와 platform-db만 빌드·배포하며 plugin registry, Connection 및 빌드된 transform을 포함하지 않는다. 따라서 독립 CLI뿐 아니라 동일 artifact가 이미지에 포함되는 배치 실행 경로가 필요하다.

## Goals / Non-Goals

**Goals:**

- CLI 프로세스 제어와 실제 dependency 조립을 분리해 가짜 runner·adapter로 프로세스 계약을 검증한다.
- registry 검증 후 plugin ID로 하나의 정의만 선택하고, 기존 runner에 필요한 collector·storage·scope를 만든다.
- 공개 출력 형식을 허용 목록 기반 JSON Lines로 고정하고 하위 오류를 경계에서 제거한다.
- signal을 runner까지 전파하고 모든 생성 자원을 결정적으로 정리한다.
- 로컬과 API 배포 이미지가 동일한 CLI package와 repository 설정 artifact를 사용한다.

**Non-Goals:**

- 새로운 collector, transform, storage 또는 migration을 구현하지 않는다.
- MySQL용 `RecordStorage`를 이 변경에서 추가하지 않는다. 등록은 되어 있어도 저장 provider가 없는 DB는 실행 전에 명확히 거부한다.
- 인증이 필요한 새 HTTP Connection 형식을 임의로 설계하지 않는다. 현재 플랫폼 DB secret 환경변수·파일 계약을 사용하고, 향후 Connection `secretRef`가 실제 connector 계약에 추가되면 같은 resolver 경계에 연결한다.
- 여러 plugin의 일괄 실행, asset 범위 실행, daemon·API·queue·scheduler를 제공하지 않는다.

## Decisions

### 전용 workspace CLI app과 주입 가능한 코어를 둔다

`apps/collector-cli`를 Node ESM workspace app으로 추가하고, 인자·환경·signal·stdout/stderr·dependency factory를 받는 `runCli` 코어와 얇은 process entrypoint를 분리한다. 코어는 결과를 반환하고 entrypoint만 `process.exitCode`와 OS signal을 다룬다. 별도 app은 NestJS lifecycle과 무관하게 실행·배포할 수 있고 프로세스 테스트에서 실제 process 경계를 유지한다.

대안으로 API app에 subcommand를 넣는 방식은 이미지 포함은 쉽지만 NestJS 의존성과 startup side effect가 수동 실행 경계에 스며든다. collection-engine에 CLI를 넣는 방식은 재사용 코어가 설정·process·DB adapter를 알게 되어 책임이 넓어진다.

### 조립 registry는 collector와 RecordStorage provider를 함께 등록한다

CLI 조립 계층은 source definition의 discriminant(`http/offset`, `http/single`, `file/csv`)를 기존 collector adapter로 변환한다. DB registry entry는 연결 factory와 `RecordStorage` factory를 한 쌍으로 제공한다. 현재 PostgreSQL entry만 수집 저장 가능하며 MySQL처럼 연결만 가능한 adapter는 `unsupported_db_storage` 설정 오류로 runner 호출 전에 거부한다. 새 storage 구현은 registry entry를 추가해 연결한다.

모든 collector adapter는 runner의 checkpoint 형식과 source batch 형식으로 변환하되 수집·가공·저장 의미를 재구현하지 않는다. config revision은 선택된 plugin/source/Connection의 비밀 제외 정규화 값에 대한 SHA-256으로 만들고, source ID는 Connection ID(파일 source는 안정적인 source 식별자)에서 결정한다. 첫 CLI 범위는 `scopeType=full`, 빈 `scopeKey`로 고정한다.

대안인 DB type 분기와 collector type 분기를 entrypoint에 직접 늘어놓는 방식은 후속 adapter 추가 시 CLI 코어 수정을 강제한다. 다만 범용 plugin system은 만들지 않고 현재 세 source discriminant와 저장 provider registry까지만 둔다.

### repository 전체 검증 후 정확한 plugin ID를 선택한다

기본 repository root는 현재 작업 디렉터리이며 테스트·이미지에서만 명시적인 내부 factory 옵션으로 바꾼다. 사용자 CLI에는 `collect <plugin-id>` 형태의 plugin ID만 노출하고 임의 root, URL, Connection ID, scope를 받지 않는다. `validateRepository`가 하나라도 오류를 반환하면 선택 대상과 무관하게 배포 설정 전체가 유효하지 않은 것으로 처리한다. 선택 결과가 없거나 둘 이상이면 runner를 호출하지 않는다.

이는 특정 plugin만 느슨하게 읽는 대안보다 배포 registry 전체가 승인된 단위라는 개발 플랜과 일치한다.

### 종료 코드는 0/1/2/3/130으로 고정한다

- `0`: 전체 성공
- `1`: 사용법 또는 실행 전 설정 실패
- `2`: 레코드 격리가 있는 부분 성공
- `3`: DB 연결을 포함한 실행 단계 실패
- `130`: SIGINT 또는 SIGTERM에 따른 취소

모든 결과는 `version`, `timestamp`, `event`, `pluginId`, `status`와 상태별 허용 필드만 직렬화한 JSON 한 줄로 남긴다. 성공·부분 성공에는 runner의 run ID와 batches/processed/accepted/rejected를 포함하고, 실패에는 자체 정의한 공개 error code만 포함한다. Error 객체, cause, stack, config 객체와 원천 값은 logger API가 받지 않게 타입과 생성 함수를 제한한다.

부분 성공을 0으로 취급하는 대안은 shell 자동화가 격리 발생을 놓친다. 모든 실패를 1로 합치는 대안은 재시도 가능한 실행 실패와 배포 설정 오류를 구분하기 어렵다.

### signal은 AbortController 하나로 통합하고 cleanup은 idempotent wrapper로 보장한다

entrypoint는 SIGINT·SIGTERM을 하나의 AbortController로 전달한다. 생성된 자원은 cleanup stack에 등록하고 `finally`에서 역순으로 닫는다. 각 close promise를 memoize하여 signal handler와 finally가 겹쳐도 실제 close는 한 번만 수행한다. cleanup 오류는 원래 결과를 덮지 않으며 공개 로그에도 하위 오류를 싣지 않는다. runner가 반환하거나 throw한 뒤 cleanup이 완료되어야 최종 결과와 exit code를 확정한다.

signal handler에서 즉시 `process.exit()`하는 대안은 checkpoint 저장 또는 pool 종료를 끊을 수 있어 사용하지 않는다.

### 이미지에는 CLI runtime과 승인된 설정·transform artifact를 함께 넣는다

API Dockerfile의 build stage에서 CLI와 plugin transform을 빌드하고 production deploy artifact에 CLI package 의존성을 포함한다. runtime에는 `plugins/`, `connections/`의 승인된 JSON과 빌드된 transform 파일만 명시적으로 복사하며 TypeScript 원본·테스트·개발 파일은 제외한다. API 기본 `CMD`는 유지하고 운영자는 동일 이미지에서 문서화된 CLI command를 별도 process로 실행한다.

별도 CLI 이미지는 중복 dependency와 설정 artifact drift를 만들 수 있어 초기 범위에서는 사용하지 않는다.

## Risks / Trade-offs

- [현재 MySQL에 RecordStorage가 없음] → MySQL을 조용히 부분 지원하지 않고 runner 실행 전 안정적인 `unsupported_db_storage`로 거부하며 후속 storage 구현이 registry를 확장한다.
- [repository 전체 검증 때문에 선택하지 않은 plugin 오류도 실행을 막음] → registry는 배포 단위라는 정책을 문서화하고 CI의 plugin 검증과 같은 결과를 사용한다.
- [JSON Lines 필드가 지나치게 적으면 진단이 어려움] → 공개 error code와 설정 파일의 비밀 제외 상대 경로·JSON pointer만 허용하고 상세 원문은 출력하지 않는다.
- [signal 도착 시 DB 작업은 즉시 중단되지 않을 수 있음] → 새 batch 시작을 막고 진행 중 작업과 cleanup 완료를 기다린다. 강제 종료 timeout은 checkpoint 일관성을 훼손할 수 있어 이번 범위에 넣지 않는다.
- [이미지에 plugin artifact를 포함하면서 크기가 증가함] → registry에 등록된 runtime 필수 파일만 복사하고 Docker 회귀 테스트로 소스·비밀 파일 미포함을 확인한다.

## Migration Plan

1. CLI app과 로컬 `pnpm collect -- <plugin-id>` 명령을 추가하되 기존 API 시작 명령은 유지한다.
2. 프로세스·단위 테스트와 PostgreSQL fixture 통합 경로로 종료 코드, runner 단일 호출 및 cleanup을 검증한다.
3. API 이미지를 확장해 같은 CLI build와 등록된 설정·transform artifact를 포함하고 이미지 내부 실행을 검증한다.
4. 운영 문서에 환경변수·password file, registry 검증, 명령과 종료 코드를 추가한다.

롤백은 CLI script와 이미지의 추가 artifact를 제거하는 것으로 가능하며 기존 API와 DB schema에는 변경이 없다.
