# 플랫폼 DB 접속과 PostgreSQL·MySQL 설치

`@oss-scp/platform-db`는 운영자가 입력한 DB 주소·포트·계정·비밀번호를 읽고 검사하는 공통 패키지입니다. 정상 입력은 연결 코드가 사용할 설정으로 반환하고, 잘못된 입력은 수정할 항목을 알리는 `PlatformDbConfigError`를 반환합니다.

PostgreSQL과 MySQL 어댑터는 API 시작 시 같은 설정으로 선택한 DB에 연결하며 `/api/v1/ready`에서 준비 상태를 확인합니다. 두 제품 모두 가공·검증된 플러그인 데이터를 위한 같은 공통 저장·기본 조회 계약을 제공합니다. 별도의 웹 설정 화면은 제공하지 않습니다.

## 내장 PostgreSQL로 빠르게 시작

기본 Compose는 PostgreSQL 17.6을 API·웹과 함께 실행합니다. DB 포트는 호스트에 공개하지 않으며 oss-scp API와 migration만 내부 네트워크에서 접근합니다.

```sh
export PLATFORM_DB_PASSWORD='무작위로-생성한-로컬-비밀번호'
docker compose up --build -d --wait
docker compose run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js
curl http://127.0.0.1:3000/api/v1/ready
```

`docker compose down`은 컨테이너를 종료하지만 명명된 DB 볼륨은 유지합니다. 데이터를 지우는 `down -v`는 일반 종료에 사용하지 않습니다.

## 이미 실행 중인 외부 PostgreSQL 사용

외부 구성은 API와 웹만 시작합니다. PostgreSQL 인스턴스·서비스·볼륨을 생성하거나 시작·종료·삭제하지 않습니다.

```sh
export PLATFORM_DB_HOST=db.example.internal
export PLATFORM_DB_PORT=5432
export PLATFORM_DB_NAME=oss_scp
export PLATFORM_DB_USER=oss_scp_app
export PLATFORM_DB_PASSWORD_FILE_HOST=/secure/host/path/platform_db_password
export PLATFORM_DB_TLS_MODE=verify-full
export PLATFORM_DB_TLS_CA_FILE=/run/secrets/platform_db_ca.pem
docker compose -f compose.external-db.yaml -f compose.external-db.secret.yaml up --build -d --wait
docker compose -f compose.external-db.yaml -f compose.external-db.secret.yaml run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js
```

DB 관리자는 DB와 전용 계정을 만들고 해당 DB의 `CONNECT`, 대상 schema의 `USAGE`·`CREATE`, 생성 객체 변경 권한을 부여해야 합니다. `compose.external-db.secret.yaml`은 호스트의 비밀번호 파일을 Compose secret으로 만들어 컨테이너의 `/run/secrets/platform_db_password`에 읽기 전용으로 제공합니다. 로컬 Docker Compose는 source 파일 권한을 유지하므로 API 컨테이너 사용자(UID 1000)가 읽을 수 있도록 소유권·권한을 설정해야 합니다(예: UID 1000 소유, mode 0400). 직접 값 방식은 override 없이 `PLATFORM_DB_PASSWORD`를 설정합니다. CA 파일은 별도 배포 mount가 필요합니다.

호스트에서 실행 중인 DB에는 `PLATFORM_DB_HOST=host.docker.internal`을 사용할 수 있습니다. 외부 서버의 DB에는 실제 DNS 이름이나 IP를 지정합니다.

## 내장 MySQL로 시작

MySQL 설치는 기본 PostgreSQL과 구분한 진입점을 사용합니다. MySQL 8.4.6과 `mysql2` 3.24.4 조합을 실제 통합 테스트로 검증했습니다. application 계정 비밀번호와 초기화용 root 비밀번호는 서로 다르게 설정하며 root 비밀번호는 API에 전달하지 않습니다.

```sh
export PLATFORM_DB_PASSWORD='무작위-application-비밀번호'
export MYSQL_ROOT_PASSWORD='별도의-무작위-root-비밀번호'
docker compose -f compose.mysql.yaml up --build -d --wait
docker compose -f compose.mysql.yaml run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js
curl http://127.0.0.1:3000/api/v1/ready
docker compose -f compose.mysql.yaml down
```

명명된 `platform_mysql_data` 볼륨은 일반 `down`과 컨테이너 재생성 뒤에도 유지됩니다. 데이터 삭제가 목적이 아니라면 `down -v`를 사용하지 않습니다. 기본 `compose.yaml`은 계속 PostgreSQL을 선택합니다.

## 이미 실행 중인 외부 MySQL 사용

DB 관리자는 MySQL에 전용 DB와 application 계정을 만들고 대상 DB에 `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `INDEX` 권한을 부여합니다. 전역 관리자 권한이나 root 자격증명을 API에 제공하지 않습니다. MySQL 8.4 기본 인증 방식을 사용하며 레거시 인증 방식으로 자동 하향하지 않습니다.

```sh
export PLATFORM_DB_HOST=mysql.example.internal
export PLATFORM_DB_PORT=3306
export PLATFORM_DB_NAME=oss_scp
export PLATFORM_DB_USER=oss_scp_app
export PLATFORM_DB_PASSWORD_FILE_HOST=/secure/host/path/platform_db_password
export PLATFORM_DB_TLS_MODE=verify-full
export PLATFORM_DB_TLS_CA_FILE=/run/secrets/platform_db_ca.pem
docker compose -f compose.external-db.mysql.yaml -f compose.external-db.mysql.secret.yaml up --build -d --wait
docker compose -f compose.external-db.mysql.yaml -f compose.external-db.mysql.secret.yaml run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js
```

외부 구성은 API와 웹만 관리하며 MySQL 인스턴스를 생성·시작·종료·삭제하지 않습니다. CA 파일은 별도 읽기 전용 mount로 제공해야 합니다. MySQL `verify-full`에는 인증서 SAN과 일치하는 DNS 호스트명이 필요하며 TLS 실패 시 평문으로 자동 전환하지 않습니다.

MySQL DDL은 암묵적으로 commit될 수 있어 실패 시 PostgreSQL과 같은 전체 rollback을 보장하지 않습니다. injection 범위를 넓히는 다중 statement 연결 옵션을 켜지 않으므로 MySQL migration 파일 하나에는 SQL statement 하나만 둡니다. migration은 재실행 가능한 전진 변경으로 작성하고, 실패 버전은 이력에 기록하지 않으며 이후 migration은 실행하지 않습니다. 실패한 DDL이 남으면 해당 migration의 복구 절차로 상태를 정리한 뒤 같은 명령을 다시 실행합니다.

공통 레코드 schema는 MySQL JSON, UTC `DATETIME(3)`과 식별·정렬 컬럼의 binary collation을 사용합니다. 최대 2,048자인 외부 키와 범위 조합은 길이 구분 canonical 값의 SHA-256 digest로 인덱싱하고 항상 저장된 원문 identity를 다시 비교합니다. digest가 같지만 원문이 다르면 다른 레코드를 갱신하지 않고 해당 저장 묶음을 실패·rollback합니다. cursor 인덱스는 범위 digest, `last_seen_at DESC`, 내부 UUID `id ASC` 순서입니다.

## 운영자가 작성할 입력

로컬 PostgreSQL용 형식 예시입니다. 주소·계정·비밀번호를 자신의 환경에 맞춰 제공하며 비밀번호 예시를 그대로 운영에 사용하지 않습니다.

```dotenv
PLATFORM_DB_TYPE=postgres
PLATFORM_DB_HOST=localhost
PLATFORM_DB_PORT=5432
PLATFORM_DB_NAME=oss_scp
PLATFORM_DB_USER=oss_scp_app
PLATFORM_DB_PASSWORD=replace-with-your-password
PLATFORM_DB_TLS_MODE=disable
```

비밀번호 파일을 사용하려면 `PLATFORM_DB_PASSWORD`를 제거하고 다음을 지정합니다. 파일에는 비밀번호만 적습니다. 경로는 플랫폼 프로세스에서 읽을 수 있는 절대 경로입니다.

```dotenv
PLATFORM_DB_PASSWORD_FILE=/run/secrets/platform_db_password
```

두 방식을 동시에 지정하면 오류입니다. 파일 끝의 LF 또는 CRLF 하나만 제거하며 비밀번호의 공백은 보존합니다. 빈 값, 남은 CR/LF, NUL과 16 KiB를 넘는 값은 거부합니다. 파일 크기 제한에는 마지막 개행도 포함됩니다. 파일은 UTF-8 일반 파일 또는 일반 파일을 가리키는 심볼릭 링크여야 합니다.

`.env`는 Git에서 제외되어 있습니다. 별도 비밀번호 파일도 저장소 밖에서 관리하고 이미지에 넣지 않습니다. 공통 패키지는 `.env`를 자동으로 읽지 않으며 호출 프로그램이 환경을 로드해 전달합니다. 원천 수집용 `connections/`와 플랫폼 운영 DB 설정은 서로 별개입니다.

## 설정 항목

선택값의 기본값은 **변수를 생략했을 때만** 적용됩니다. 빈 문자열은 잘못된 설정입니다.

| 변수 | 규칙·기본값 |
|---|---|
| PLATFORM_DB_TYPE | 필수. 등록된 `postgres` 또는 `mysql` |
| PLATFORM_DB_HOST | 필수. 호스트명/IP, URL 형식 불가 |
| PLATFORM_DB_PORT | 등록 어댑터의 기본 포트. 지정 시 십진 정수 1~65535 |
| PLATFORM_DB_NAME | 필수. 사용할 데이터베이스 이름 |
| PLATFORM_DB_USER | 필수. DB 접속 계정 |
| PLATFORM_DB_PASSWORD | 직접 비밀번호. 파일 방식과 하나만 선택 |
| PLATFORM_DB_PASSWORD_FILE | 비밀번호 파일의 절대 경로. 최대 16 KiB |
| PLATFORM_DB_POOL_MAX | 기본 10. 십진 정수 1~100 |
| PLATFORM_DB_CONNECT_TIMEOUT_MS | 기본 5000. 연결 확보 대기 시간, 십진 정수 1~60000 ms |
| PLATFORM_DB_TLS_MODE | 기본 verify-full. disable 또는 verify-full |
| PLATFORM_DB_TLS_CA_FILE | 선택. UTF-8 PEM 인증서 파일의 절대 경로, 최대 1 MiB |

DB 종류·주소·이름·계정은 비어 있거나 앞뒤 공백·제어문자를 포함하면 거부합니다. 숫자는 부호·소수·지수·공백을 허용하지 않습니다. 제품 ID는 `postgres`, `mysql`이며 기본 포트는 각각 5432, 3306입니다. API와 migration CLI에 두 어댑터가 고정 등록되어 있습니다.

## 암호화 연결 설정

`verify-full`은 암호화와 서버 인증서 체인·접속 호스트명 검증을 요구합니다. 사설 CA가 필요하면 `PLATFORM_DB_TLS_CA_FILE`에 인증서 또는 인증서 묶음을 지정합니다. 생략 시 실행 환경의 기본 신뢰 저장소를 사용합니다.

```dotenv
PLATFORM_DB_TLS_MODE=verify-full
PLATFORM_DB_TLS_CA_FILE=/run/secrets/platform_db_ca.pem
```

로컬 평문 DB에서는 `disable`을 명시하고 CA 파일 항목을 생략합니다. `disable`과 CA 파일을 함께 지정하면 오류입니다. 두 어댑터는 실제 연결에서도 인증서 체인과 호스트명을 검증하며 실패 시 평문으로 자동 전환하지 않습니다. MySQL verify-full은 DNS 호스트명을 요구합니다.

## 정상·오류 결과

| 입력 | 결과 |
|---|---|
| 등록된 DB와 올바른 필수값 | 기본값을 보충한 설정 반환 |
| `PLATFORM_DB_PORT=abc` | INVALID_PORT, PLATFORM_DB_PORT와 허용 정수 범위 안내 |
| DB 계정 누락 | REQUIRED, PLATFORM_DB_USER 안내 |
| 비밀번호 값/파일 동시 지정 또는 모두 누락 | PASSWORD_SOURCE |
| 파일을 읽을 수 없거나 UTF-8/크기/경로 조건 위반 | INVALID_FILE |
| 파일에서 읽은 비밀번호가 빈 값·CR/LF·NUL 포함 | INVALID_PASSWORD |
| 미등록 DB 종류 | UNREGISTERED_ADAPTER, 파일 읽기 전 거부 |
| 잘못된 TLS 모드 / disable과 CA 함께 지정 | INVALID_TLS / TLS_CA_CONFLICT |
| 잘못된 PEM 인증서 | INVALID_CA |

오류는 `code`, `setting`, 고정된 `message`로 처리합니다. 입력 비밀번호·파일 경로·원본 파일 시스템 오류를 포함하지 않습니다. 정상 반환 설정에는 비밀번호가 있으므로 설정 객체 전체를 로그나 HTTP 응답에 출력하지 않습니다.

설정 검사 성공은 DB 접속 성공을 뜻하지 않습니다. API와 migration CLI가 실제 연결로 인증·응답·TLS를 확인합니다.

## 서버·수집 CLI에서 사용할 공통 API

공개 진입점은 다음과 같습니다.

```typescript
import {
  readPlatformDbConfig,
  selectPlatformDbAdapter,
  type PlatformDbAdapterFactory,
} from '@oss-scp/platform-db';

// 서버와 CLI의 시작 코드가 빌드에 포함된 실제 어댑터 목록을 전달합니다.
function readSettings(adapters: readonly PlatformDbAdapterFactory[]) {
  const config = readPlatformDbConfig(process.env, adapters);
  const adapter = selectPlatformDbAdapter(config.type, adapters);
  return { config, adapter };
}
```

파서는 네트워크 연결이나 동적 모듈 로딩을 수행하지 않습니다. 등록 목록은 DB별 연결 코드가 제공하는 고유 `id`, `contractVersion: 1`, `defaultPort`, `connect(config)`로 구성됩니다. 중복 ID·잘못된 포트·미지원 계약 버전·연결 함수 누락을 거부합니다. 테스트용 어댑터는 테스트에서만 사용합니다.

`connect`가 반환하는 연결은 `checkReady(): Promise<boolean>`와 `close(): Promise<void>`를 제공합니다. 어댑터는 대기 시간·연결 풀·TLS 검증을 집행하고, 준비 상태 검사는 `connectTimeoutMs` 안에 반환하며 DB 장애는 false로 표현합니다. 종료는 반복 호출 가능해야 합니다. 연결 도중 실패한 자원은 연결 코드가 정리하고, 외부로 공개하는 연결 오류에도 비밀정보를 포함하지 않아야 합니다.

설정/최초 연결 실패는 API 시작 실패입니다. 실행 중 DB 장애는 `/api/v1/ready`의 HTTP 503이며 `/api/v1/health` liveness는 성공을 유지합니다. migration은 앱 시작 시 자동 실행하지 않고 `pnpm db:migrate` 또는 위 Compose 명령으로 명시적으로 실행합니다.

## PostgreSQL·MySQL 공통 레코드 저장

`createPlatformRecordAdapters(type, connection)`은 선택한 제품에 맞는 `RecordStorage`와 `RecordQuery`를 반환합니다. API와 수동 수집 CLI는 이 조립 경계를 사용하므로 가공 코드와 업무 서비스는 DB driver 타입이나 SQL 방언을 알지 않습니다. 제품별 직접 factory도 테스트와 저수준 조립을 위해 제공합니다.

### 데이터와 식별 범위

가공된 `asset`, `finding` 및 후속 데이터 종류는 `platform_records`에 함께 저장합니다. 공통 식별 정보는 일반 컬럼에, 플러그인이 선언하고 검증한 원천 필드는 `source_values` JSONB에 둡니다.

```text
pluginId + dataType + sourceId + externalKeyType + externalKey
```

위 조합이 레코드의 유일 범위입니다. 숫자 `1`과 문자열 `"1"`은 다른 키이며, 같은 범위의 재전달은 내부 UUID를 유지하고 `source_values`와 마지막 관측 시각만 갱신합니다. 관계는 `platform_record_relations`가 내부 UUID를 참조합니다. 새 데이터 종류를 추가해도 종류별 테이블이나 repository를 추가하지 않습니다.

단일 레코드 JSON은 직렬화 기준 1 MiB, checkpoint는 64 KiB로 제한합니다. 저장된 checkpoint가 없다는 상태는 `null`로 나타내므로 다음 checkpoint에는 `null`이 아닌 JSON 값을 사용합니다. 외부 키는 최대 2,048자이며 숫자 키와 JSON 안의 숫자는 유한한 값만 허용합니다. undefined, 함수, 순환 참조처럼 JSON으로 손실 없이 보존할 수 없는 값은 저장 전에 거부합니다.

### 실행, checkpoint와 오류

`collection_runs`는 플러그인·수집처·실행 범위·설정 revision, 상태와 처리 집계를 기록합니다. `collection_checkpoints`는 같은 범위의 마지막 저장 완료 위치를 보관합니다. `collection_issues`에는 격리된 원천 레코드의 위치, 오류 코드·경로·제한된 메시지와 key hint만 기록하며 원천 레코드 전체와 응답 메타데이터는 복제하지 않습니다.

`commitBatch`는 다음 항목을 선택한 DB의 하나의 transaction으로 확정합니다.

1. 레코드 upsert와 내부 ID 유지
2. 관계 참조 확인과 멱등 저장
3. 격리 오류 기록
4. checkpoint 갱신
5. 실행 처리 건수 갱신

관계 끝점을 찾을 수 없거나 입력한 시작 checkpoint가 현재 값과 다르거나 DB 저장이 실패하면 묶음 전체를 rollback합니다. 호출자는 이전 checkpoint부터 같은 묶음을 다시 전달할 수 있으며, 이미 확정된 동일 키는 중복 생성되지 않습니다.

### 원천 데이터와 플랫폼 업무 정보의 경계

공통 저장 경로가 소유하는 값은 `platform_records.source_values`와 원천 관측 시각입니다. 담당자, 수동 상태와 감사 정보는 후속 별도 테이블이 레코드 내부 UUID를 참조해야 합니다. 공통 upsert는 그러한 플랫폼 소유 행을 생성·수정·삭제하지 않습니다.

현재 공통 저장 범위에는 JSON 내부 필드 검색·필터·사용자 지정 정렬 인덱스, 전체 수집 완료에 따른 보관·복원과 담당자 기능이 포함되지 않습니다. PostgreSQL과 MySQL 사이의 기존 데이터 이전 또는 down migration도 제공하지 않습니다.

## 개발·검증

저장소 루트에서 [서버 가이드](server-development.md)의 Node.js 24 LTS와 pnpm 10.34.5를 준비한 뒤 실행합니다.

```sh
pnpm install --frozen-lockfile
pnpm --filter @oss-scp/platform-db test
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

패키지 테스트는 Docker의 `postgres:17.6-bookworm`과 `mysql:8.4.6` 실제 DB를 사용합니다. PostgreSQL 17.6/`pg` 8.23.0과 MySQL 8.4.6/`mysql2` 3.24.4 조합에서 정상 연결, 인증·접속·TLS 실패, 종료 및 migration 재실행·실패 처리를 검증합니다. `pnpm test:docker:mysql`은 MySQL 내장/외부 설치와 영속성을 추가 검증합니다. 검증하지 않은 버전의 호환성을 주장하지 않습니다.

## 외부 플러그인과 이미지 배포

Compose 실행 전 운영자 플러그인 Git checkout의 절대 경로를 지정합니다.

```bash
export OSS_SCP_CONFIG_PATH=/absolute/path/to/oss-scp-plugin-config
docker compose -f compose.external-db.yaml config --quiet
docker compose -f compose.external-db.yaml up -d
```

Compose는 이 경로를 `/config:ro`로 주입하며 API 컨테이너는 UID `1000`으로 실행됩니다. 따라서 UID `1000`이 설정 루트와 모든 상위 디렉터리를 탐색(`x`)하고, registry·선언 파일·사전 빌드된 JavaScript 가공 모듈을 읽을(`r`) 수 있어야 합니다. 비밀 정보를 포함하지 않는 전용 checkout이라면 디렉터리 `0755`, 파일 `0644`가 단순한 예시입니다. 접근 범위를 줄여야 한다면 컨테이너가 읽을 수 있는 소유자 또는 그룹을 맞춘 뒤 디렉터리 `0750`, 파일 `0640`을 사용합니다. 설정 checkout에는 비밀번호나 토큰을 넣지 않고 DB 비밀번호는 별도 secret 파일 또는 실행 환경으로 제공합니다.

배포 시 플랫폼 이미지는 정확한 tag 또는 digest로, 플러그인은 Git SHA로 고정하고 해당 이미지의 preflight 명령으로 조합을 먼저 검증합니다. DB migration은 이미지·플러그인 교체와 분리해 명시적으로 실행합니다. 롤백은 DB를 자동 역행시키지 않고 이전에 검증한 image digest와 plugin SHA 조합으로 재기동하며, 데이터 변경은 별도 백업·역이관 절차를 따릅니다.
