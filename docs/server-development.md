# 서버 개발·실행 가이드

서버는 `apps/api`의 NestJS 앱입니다. 개발은 로컬 또는 Docker 개발 구성으로 진행하며, 기본 Compose는 빌드된 앱과 PostgreSQL을 실행합니다. MySQL은 `compose.mysql.yaml`로 선택합니다. API 시작에는 플랫폼 DB 설정과 선택한 DB 연결이 필요합니다. 클라이언트 시작 화면은 상태 확인 API에 연결합니다. 업무 API와 초기화할 샘플 데이터는 후속 범위입니다. Docker 개발 방법은 [클라이언트 개발·실행 가이드](client-development.md)를 참고하세요.

## 도구 버전

| 도구 | 고정 버전 |
|---|---|
| Node.js | 24.19.0 (`.nvmrc`, Docker, CI 공통) |
| pnpm | 10.34.5 (`packageManager`) |
| NestJS / Nest CLI | 11.2.3 / 11.0.24 |
| TypeScript | 5.9.3 |
| Vitest | 4.1.11 |
| ESLint / typescript-eslint | 10.10.0 / 8.70.0 |

[NestJS 공식 안내](https://docs.nestjs.com/first-steps), [pnpm 호환성](https://pnpm.io/installation), [Vitest 안내](https://vitest.dev/guide/) 및 고정 버전의 npm `engines`·`peerDependencies`를 확인했습니다. 정확한 의존성은 `pnpm-lock.yaml`로 관리합니다.

## 로컬 개발

Node.js 24.19.0을 설치합니다. nvm 사용자는 저장소 루트에서 `nvm install`과 `nvm use`로 `.nvmrc` 버전을 선택할 수 있습니다. Node.js에 포함된 npm으로 pnpm을 설치합니다.

```sh
npm install --global pnpm@10.34.5
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm dev
```

명령은 모두 저장소 루트에서 실행합니다. `pnpm dev`는 Nest CLI의 `nest start --watch`를 실행합니다. API 응답 코드를 수정해 저장하면 서버가 재시작되고 다음 요청에 반영됩니다. 종료는 `Ctrl+C`입니다. 앱 개발에 Docker는 필요하지 않습니다.

별도 터미널에서 확인합니다.

```sh
curl -i http://127.0.0.1:3000/api/v1/health
curl -i http://127.0.0.1:3000/api/v1/collection-status
```

HTTP 200, JSON 콘텐츠 유형, 본문 `{"status":"ok"}`를 반환합니다. 인증은 필요하지 않으며 DB나 수집처 상태·데이터 최신성을 보장하는 API는 아닙니다. 정의되지 않은 경로는 404를 반환합니다.

API는 기동할 때 검증된 registry의 모든 수집 정의를 수동 CLI와 같은 공통 실행 경로로 비동기 실행합니다. HTTP 수신은 장시간 수집 완료를 기다리지 않으며 `/api/v1/collection-status`에서 대상별 `uncollected`, `running`, `success`, `partial`, `failed` 상태와 설정 revision·시작·종료 시각을 조회할 수 있습니다. 등록 대상이 없으면 실행을 만들지 않습니다. 같은 대상의 API 기동이나 수동 수집이 겹치면 DB 실행권을 얻은 하나만 저장하며, 중단된 실행권은 2분 후 회수됩니다. 정상 종료 시 API가 실행 중인 자식 수집 프로세스에 종료 신호를 전달합니다.

### 플러그인 수동 동기화 API

목록 화면과 운영자는 `POST /api/v1/plugins/<plugin-id>/sync-runs`로 해당 플러그인의 활성 수집 대상 전체를 full 범위로 요청할 수 있습니다. API는 완료를 기다리지 않고 HTTP 202와 `requestId`를 반환합니다. `GET /api/v1/sync-runs/<request-id>`는 `accepted`, `running`, `success`, `partial`, `failed` 상태를 반환하고, `GET /api/v1/plugins/<plugin-id>/sync`는 실행 가능 여부·현재 실행·마지막 성공 시각을 반환합니다.

계정관리가 비활성화된 현재 배포 모드에서는 명시적인 기본 권한 정책이 `collection:execute`를 허용합니다. 후속 계정관리 활성 모드는 같은 authorizer 경계에서 권한을 거부할 수 있으며 거부 응답은 플러그인이나 실행 존재 여부를 노출하지 않습니다. 같은 대상의 기동·CLI·API 실행이 겹치면 DB 실행권이 하나만 저장을 확정하고, API의 중복 요청은 HTTP 409를 반환합니다. 원천·가공·저장 실패의 원문과 자격증명은 응답하지 않습니다.

요청 상태는 API 프로세스 메모리에 제한적으로 유지되므로 재시작 뒤 이전 `requestId`는 조회되지 않을 수 있습니다. 실제 collection run, 마지막 성공과 저장 데이터는 DB에 남으며 plugin sync 상태 endpoint로 다시 확인할 수 있습니다.

샘플 자산을 컨테이너에서 기동 수집할 때는 mock 서비스뿐 아니라 Docker 네트워크용 Connection 주소가 필요합니다. 호스트용 `127.0.0.1` 설정과 컨테이너용 `mock-api:3001` 설정의 차이, 올바른 시작 순서와 상태 확인 방법은 [Mock API 실행 안내](mock-api.md)를 따릅니다.

## 환경변수

API 실행에는 `OSS_SCP_CONFIG_ROOT`가 필요합니다. 루트에서 `cp .env.example .env` 후 편집합니다. 로컬 개발·빌드 실행 모두 루트 `.env`를 읽으며 이미 설정된 프로세스 환경변수가 우선합니다. 비밀정보는 커밋하거나 이미지에 포함하지 않습니다.

| 변수 | 기본값 | 용도 |
|---|---|---|
| HOST | 127.0.0.1 | 로컬 서버의 수신 주소 |
| PORT | 3000 | 로컬 서버 포트, 정수 1–65535 |
| API_PORT | 3000 | Compose가 호스트에 공개하는 포트 |
| OSS_SCP_CONFIG_ROOT | 없음 | plugin·Connection registry와 빌드된 서버 모듈을 포함한 설정 루트 |

```sh
OSS_SCP_CONFIG_ROOT="$PWD" PORT=3100 pnpm dev
curl http://127.0.0.1:3100/api/v1/health
```

포트가 잘못되었거나 사용 중이면 실패 로그와 0이 아닌 종료 코드가 발생합니다. 포트를 바꾸거나 해당 포트를 사용하는 본인의 프로세스를 종료한 후 다시 실행합니다. `.env` 변경은 명령을 종료하고 다시 실행해 적용합니다.

플랫폼 DB 입력, 내장·외부 PostgreSQL/MySQL과 migration은 [플랫폼 DB 접속과 설치](platform-db.md)를 참고하세요.

## 빌드와 검증

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:process
pnpm start
```

`pnpm test`는 서버를 컴파일한 뒤 Vitest로 배포 코드의 HTTP 계약·설정을 검증합니다. `pnpm test:process`는 빌드 산출물이 필요하며, 실제 배포 실행·시작 실패·종료와 임시 복사본에서의 `.env` 로딩·watch 재시작을 확인합니다. 사용자 소스는 수정하지 않습니다. 테스트용 프로세스와 임시 복사본은 종료 시 정리합니다.

`pnpm start`는 `apps/api/dist/main.js`를 실행하며 변경을 감지하지 않습니다. 종료는 `Ctrl+C`입니다. 테스트 임시 프로세스 제어는 macOS/Linux 기준입니다.

## Docker와 Compose 실행

Docker Engine/Desktop과 Docker Compose v2 (`--wait` 지원)가 필요합니다. 소스를 받은 뒤 루트에서 실행하며 호스트에 Node.js·pnpm을 설치하지 않아도 됩니다. 이미지와 의존성 다운로드를 위한 인터넷 접속은 필요합니다.

```sh
docker compose up --build -d --wait
curl -i http://127.0.0.1:3000/api/v1/health
docker compose ps
docker compose logs api
docker compose down
```

Dockerfile이 컨테이너 내부에서 의존성을 설치하고 소스를 빌드합니다. 최종 이미지는 빌드된 JS와 운영 의존성으로 비루트 실행하며 소스 볼륨·watcher를 사용하지 않습니다. 소스 변경을 반영하려면 이미지를 다시 빌드해야 합니다. 이미지의 healthcheck는 응답 시간·HTTP 상태·JSON을 확인합니다.

Compose는 컨테이너 내부 `HOST=0.0.0.0`, `PORT=3000`을 사용합니다. 로컬 `.env`의 HOST·PORT는 전달하지 않으며 공개 포트만 API_PORT로 변경합니다.

```sh
API_PORT=3100 docker compose up --build -d --wait
curl http://127.0.0.1:3100/api/v1/health
API_PORT=3100 docker compose down
```

이미지만 빌드하고 Compose 없이 실행할 수도 있습니다.

```sh
docker build -f apps/api/Dockerfile -t oss-scp-api:local .
docker run --rm --name oss-scp-api-demo -p 127.0.0.1:3100:3000 oss-scp-api:local
```

별도 터미널에서 `curl http://127.0.0.1:3100/api/v1/health`로 확인하고 `docker stop oss-scp-api-demo`로 종료합니다. `--rm`으로 컨테이너는 삭제되며 이미지는 재사용을 위해 남습니다. 더 이상 필요하지 않으면 `docker image rm oss-scp-api:local`로 이미지를 삭제합니다. 공개 레지스트리에서 받는 릴리스 이미지는 아직 제공하지 않습니다.

기본 공개 주소는 호스트의 127.0.0.1입니다. 외부 서버에서 제공하려면 배포 설정에서 Compose ports를 `"0.0.0.0:${API_PORT:-3000}:3000"`으로 바꾸거나 호스트의 역방향 프록시를 연결합니다. HTTPS·도메인·외부 접근 정책은 설치 환경에서 구성합니다. 이 초기 서버에는 업무 기능이나 인증이 없습니다.

Docker 자동 검증은 다음 명령입니다. 기본 테스트 포트 18300이 사용 중이면 API_PORT를 바꿉니다.

```sh
bash scripts/test-docker.sh
# 또는 Node.js·pnpm이 있는 개발 환경에서
pnpm test:docker
```

별도 Compose 프로젝트로 빌드·기동·호스트 API·이미지 단독 실행·비루트·개발 파일 제외·무응답 unhealthy 전환을 검증합니다. 실패 시 로그를 출력하고 테스트 컨테이너와 네트워크를 정리합니다. GitHub Actions도 같은 스크립트를 사용합니다.

## 클라이언트 연동 계약 (#9)

공통 workspace는 `apps/*`, `packages/*`를 포함합니다. 서버는 `apps/api`, 클라이언트는 `apps/web`입니다. Vite와 Nginx의 `/api` 프록시는 경로를 제거하지 않고 `/api/v1/health`를 그대로 서버에 전달해야 합니다. Compose 내부 서버 주소는 `http://api:3000`이며, 로컬 개발은 `http://127.0.0.1:3000`입니다. 브라우저에서는 같은 origin의 `/api/v1/health`를 호출합니다. 성공 계약은 HTTP 200과 `{"status":"ok"}`이며 클라이언트는 로딩·성공·실패를 구분하고 5초 제한 시간 이후 실패를 표시합니다.

## 검증 범위

자동 검증 항목은 [서버·클라이언트 통합 CI](../.github/workflows/integration-ci.yaml)에서 관리하고, 실행 결과는 GitHub Actions와 PR에서 확인합니다. 로컬에서는 macOS arm64와 Docker linux/arm64를 확인했으며, CI는 Ubuntu linux/amd64에서 실행합니다. Windows·다른 OS/CPU·공개 멀티 플랫폼 릴리스 이미지는 미검증 범위입니다.

## 외부 플러그인 설정

API와 수동 수집 CLI는 `OSS_SCP_CONFIG_ROOT`가 가리키는 운영자 설정 revision을 사용합니다. 이 디렉터리에는 `plugins/registry.json`, `connections/registry.json`, 각 선언 파일과 사전 빌드된 JavaScript 가공 모듈이 있어야 합니다. API는 DB 연결과 listen 전에 전체 설정 및 모듈 export를 검증하며 일부만 유효한 상태로 시작하지 않습니다.

API는 기동 검증에 성공한 수집 정의와 메뉴를 하나의 읽기 전용 runtime snapshot으로 고정합니다. 실행 중 외부 설정 파일을 수정하거나 디렉터리를 교체해도 현재 프로세스에는 반영되지 않습니다. 운영 hot reload와 설정 watcher는 지원하지 않으므로, 변경한 설정 revision을 먼저 검증한 뒤 API를 재기동해야 합니다. 재기동 시 전체 검증이 실패하면 API는 DB 연결과 listen 전에 종료하고, 설정 루트 기준 상대 파일·필드와 안전하게 일반화한 원인을 함께 출력합니다.

로컬 실행 예시:

```bash
pnpm build:plugin-transforms
OSS_SCP_CONFIG_ROOT="$PWD" pnpm start
```

설정 revision 변경 절차:

```bash
OSS_SCP_CONFIG_ROOT="/path/to/config-revision" pnpm validate:plugins
OSS_SCP_CONFIG_ROOT="/path/to/config-revision" pnpm start
```

실행 중인 프로세스의 설정을 바꾸려면 기존 프로세스를 정상 종료한 다음 두 번째 명령으로 다시 시작합니다. 설정 검증 실패 시 기존에 검증되어 실행 중인 프로세스나 배포 revision을 유지하고 오류를 수정한 뒤 재검증합니다.

## 저장 목록의 검색·필터 조건

`GET /api/v1/records`의 선택적 `q`와 `filters`를 지원한다. `filters`는 JSON 배열을 URL 인코딩해 전달한다. 예를 들어 아래 인자를 `URLSearchParams`로 직렬화한다.

```json
{
  "pluginId": "vulnerabilities-local-csv",
  "sourceId": "file:fixtures/csv/vulnerabilities.csv",
  "dataType": "vulnerability",
  "q": "CVE",
  "filters": "[{\"field\":\"affected\",\"kind\":\"select\",\"value\":true},{\"field\":\"score\",\"kind\":\"numberRange\",\"min\":7},{\"field\":\"observedAt\",\"kind\":\"dateRange\",\"from\":\"2026-09-01\",\"to\":\"2026-09-14\"}]"
}
```

검색 가능한 필드는 OR, 서로 다른 필터와 검색은 AND, multiSelect의 `values` 내부는 OR로 결합한다. 서버는 등록된 플러그인 정의와 source 범위로 허용 필드·종류·옵션을 확인한다. 빈 검색어·빈 다중 선택·양쪽이 없는 범위는 조건을 제거한다. 중복 필드, 추가 키, 반복 q/filters, 잘못된 JSON·타입·범위·날짜는 DB 접근 전 `400 INVALID_QUERY`다. 검색어는 정규화 전후 200 Unicode 코드 포인트, filters는 디코딩한 UTF-8 4096바이트·20항목, 다중 선택은 100값까지 받는다.

PostgreSQL과 MySQL 모두 SQL WHERE에서 전체 범위에 조건을 적용한 뒤 고정 정렬과 cursor 경계를 적용한다. 원천 수집이나 저장값 변경은 실행하지 않는다. 문자열 비교는 DB 기본 collation과 무관하며 날짜 비교는 세션 시간대와 무관한 UTC를 사용한다. 잘못된 저장값은 변환 오류 대신 불일치로 처리한다. JSON 부분 문자열 조회는 범위 내 스캔이 필요할 수 있다.

새 cursor는 v2이며 정규화된 조건과 검색·필터 선언의 SHA-256 지문에 귀속된다. 조건 변경 또는 선언 변경 시 `400 INVALID_CURSOR`로 거부한다. 필터 순서, multiSelect 순서·중복, 검색어 ASCII 대소문자만 다른 요청은 동일 조건이다. v1 cursor는 활성 조건이 없는 요청에만 허용한다. 지문은 접근 권한 증명이 아니며 매 요청에서 선언 검증을 수행한다. 수집 상태와 lastStoredAt은 필터와 무관하게 기존 범위를 나타낸다. 내부 DB 오류는 비밀정보 없는 `503 QUERY_FAILED`로 반환한다.

## 저장 목록 정렬

번호형 조회는 플러그인이 `sortable: true`로 허용한 최상위 scalar 필드 하나를 `sort`와 `direction=asc|desc`로 정렬할 수 있다. 두 파라미터는 함께 있어야 하며 미허용·중복·부분 값과 cursor 결합은 DB 접근 전에 `400 INVALID_QUERY`로 거부한다. 정렬이 없거나 cursor 조회이면 기존 `lastSeenAt DESC, id ASC`를 유지한다.

정렬은 검색·필터 이후, LIMIT/OFFSET 이전에 적용한다. 유효한 scalar 값을 요청 방향으로 정렬하고 null·타입 불일치·잘못된 datetime은 항상 뒤에 둔다. 같은 값은 `lastSeenAt DESC, id ASC`로 안정화한다. JSON 계산 정렬은 전용 index가 없어 범위가 커지면 비용이 증가할 수 있다.

번호형 요청(`page`)에도 동일 조건을 count와 목록 모두에 적용한다. 전체 건수·페이지 수·범위를 벗어난 페이지 보정은 일치 결과를 기준으로 하며, 기존 REPEATABLE READ 읽기 전용 트랜잭션을 유지한다.
