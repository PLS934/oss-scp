# 플러그인 수동 수집 CLI

수동 수집 CLI는 등록된 플러그인 하나를 원천에서 읽어 가공하고 플랫폼 DB에 저장한다. NestJS HTTP 서버, Redis, worker, LDAP를 시작하지 않으며 자동 수집과 같은 `collection-engine` 코어를 사용한다.

## 실행 전 준비

CLI는 `OSS_SCP_CONFIG_ROOT`에 있는 `plugins/registry.json`과 `connections/registry.json` 전체를 검증한다. 실행 인자에는 registry에 등록된 plugin ID 하나만 허용하며 URL, Connection ID, 개별 plugin 경로는 받을 수 없다. 선택하지 않은 설정도 잘못되어 있으면 배포 설정 전체가 유효하지 않으므로 실행하지 않는다.

수집 방식은 CLI 사용자가 별도로 선택하지 않는다. 플러그인 작업자가 `source.json`에 선언한 transport와 format을 `plugin-config`가 검증된 수집 정의로 만들고, CLI가 그 정의에 맞는 collector를 자동 선택한다. 예를 들어 HTTP CSV 플러그인은 `request.transport`가 `http`, `request.format`이 `csv`인 정의로 변환되어 공통 HTTP CSV collector를 사용한다.

플랫폼 DB 설정은 API와 같은 환경변수를 사용한다.

| 환경변수 | 설명 |
|---|---|
| `PLATFORM_DB_TYPE` | 현재 수집 저장은 `postgres`만 지원한다. MySQL `RecordStorage`는 아직 지원하지 않는다. |
| `PLATFORM_DB_HOST`, `PLATFORM_DB_PORT` | DB host와 port |
| `PLATFORM_DB_NAME`, `PLATFORM_DB_USER` | DB와 전용 계정 |
| `PLATFORM_DB_PASSWORD` | 비밀번호 직접 주입. password file과 동시에 사용하지 않는다. |
| `PLATFORM_DB_PASSWORD_FILE` | 비밀번호 secret 파일 경로. 직접 주입과 동시에 사용하지 않는다. |
| `PLATFORM_DB_TLS_MODE` | `verify-full` 또는 `disable` |
| `PLATFORM_DB_TLS_CA_FILE` | `verify-full`에서 사용할 CA 파일 |

비밀번호·token·connection string은 Git의 plugin·Connection 파일이나 CLI 인자에 넣지 않는다. 현재 HTTP Connection 계약에는 인증 secret이 없으며, 인증 connector가 추가될 때 선언된 `secretRef` resolver를 별도 계약으로 연결한다. Kubernetes Secret이나 Compose secret은 `PLATFORM_DB_PASSWORD_FILE`이 가리키는 읽기 제한 파일로 마운트할 수 있다.

플랫폼 DB migration을 먼저 적용하고 플러그인 transform을 빌드한다.

```sh
pnpm db:migrate
pnpm build:plugin-transforms
OSS_SCP_CONFIG_ROOT="$PWD" pnpm collect -- sample1-offset-api
```

등록된 HTTP CSV 플러그인도 같은 명령 형식으로 실행한다.

```sh
OSS_SCP_CONFIG_ROOT="$PWD" pnpm collect -- vulnerabilities-http-csv
```

실제 PostgreSQL과 mock API를 연결한 전체 프로세스 검증은 Docker가 실행 중인 개발 환경에서 다음 명령으로 수행한다. 이 검사는 sample1의 72건 offset 수집과 HTTP CSV의 53건·3묶음 수집, 동일 원천 재실행, 저장 실패 후 checkpoint 재개, 가공 오류 격리와 원천 종료 후 저장 데이터 조회를 확인한다. MySQL에서는 `pnpm test:integration:sample1:mysql`로 같은 저장·재개 계약을 검증한다.

```sh
pnpm test:integration:sample1
```

완료된 `full` 실행을 다시 시작하면 원천의 처음부터 새 전체 수집을 수행한다. 실행이 실패하면 마지막으로 원자 저장된 checkpoint에서 재개하므로, 실패한 묶음은 다시 처리되지만 이미 확정된 묶음은 건너뛴다.

HTTP CSV checkpoint는 저장이 완료된 행 수다. 재개할 때 원천 CSV를 처음부터 다시 다운로드·파싱하지만 확정된 행은 가공·저장하지 않고 다음 행부터 처리한다. 따라서 실행 사이에 원천의 행 순서와 앞부분이 유지되어야 중복·누락 없이 재개할 수 있다. 원천이 재정렬되거나 앞 행을 삽입·삭제할 수 있다면 실패 실행을 이어가기보다 새로운 전체 실행에 적합한 안정적인 snapshot을 제공해야 한다.

배포 API 이미지에는 같은 CLI가 포함되지만 운영자 registry·transform은 포함되지 않는다. Compose가 `/config:ro`로 주입한 외부 설정 revision을 사용해 별도 일회성 프로세스로 실행한다.

```sh
docker compose run --rm api node node_modules/@oss-scp/collector-cli/dist/process.js sample1-offset-api
```

API 이미지의 기본 `CMD`는 계속 NestJS 서버를 실행한다. 수동 CLI는 별도 명령을 지정했을 때만 실행된다.

## 출력과 종료 코드

CLI는 stdout에 최종 JSON 한 줄만 출력한다. 성공·부분 성공에는 `pluginId`, `runId`, `batches`, `processed`, `accepted`, `rejected`가 포함된다. 실패에는 원본 오류 대신 안정적인 `errorCode`만 포함되며 전체 설정, 원천 응답, 비밀번호, token, connection string, driver 오류와 stack은 출력하지 않는다.

| 종료 코드 | 상태 | 의미 |
|---:|---|---|
| 0 | `success` | 모든 입력 레코드를 저장했다. |
| 1 | `failed` | 사용법 또는 실행 전 registry·DB 설정 오류다. |
| 2 | `partial` | 일부 레코드를 격리하고 나머지를 저장했다. |
| 3 | `failed` | DB 연결, 수집, 가공 또는 저장 실행이 실패했다. |
| 130 | `cancelled` | SIGINT 또는 SIGTERM을 받아 안전하게 중단했다. |

SIGINT·SIGTERM을 받으면 새 묶음을 시작하지 않고 진행 중 경계를 마친 뒤 DB 연결을 닫는다. 같은 cleanup이 반복 호출되어도 실제 자원 종료는 한 번만 수행된다.

## 외부 설정 루트

수동 수집은 현재 디렉터리를 탐색하지 않습니다. plugin ID와 함께 검증할 외부 설정 루트를 명시합니다.

```bash
OSS_SCP_CONFIG_ROOT="$PWD" pnpm collect -- sample1-offset-api
```

배포 이미지에서도 `/config:ro`로 주입한 동일 revision과 `OSS_SCP_CONFIG_ROOT=/config`를 사용합니다. 개별 plugin 경로나 원천 URL을 인자로 지정해 registry를 우회할 수 없습니다.
