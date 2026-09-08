# 서버 개발·실행 가이드

서버는 `apps/api`의 NestJS 앱입니다. 개발은 로컬에서 하고, Docker는 배포 또는 Node.js·pnpm이 없는 환경에서 실행하는 데 사용합니다. DB·로그인·외부 자격증명 없이 상태 확인 API를 실행할 수 있습니다. 현재는 업무 API나 클라이언트, 초기화할 샘플 데이터가 없습니다. 샘플 데이터는 #5, 클라이언트는 #9에서 추가합니다.

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
```

HTTP 200, JSON 콘텐츠 유형, 본문 `{"status":"ok"}`를 반환합니다. 인증은 필요하지 않으며 DB나 수집처 상태·데이터 최신성을 보장하는 API는 아닙니다. 정의되지 않은 경로는 404를 반환합니다.

## 환경변수

`.env` 없이도 기본값으로 동작합니다. 변경하려면 루트에서 `cp .env.example .env` 후 편집합니다. 로컬 개발·빌드 실행 모두 루트 `.env`를 읽으며 이미 설정된 프로세스 환경변수가 우선합니다. 비밀정보는 커밋하거나 이미지에 포함하지 않습니다.

| 변수 | 기본값 | 용도 |
|---|---|---|
| HOST | 127.0.0.1 | 로컬 서버의 수신 주소 |
| PORT | 3000 | 로컬 서버 포트, 정수 1–65535 |
| API_PORT | 3000 | Compose가 호스트에 공개하는 포트 |

```sh
PORT=3100 pnpm dev
curl http://127.0.0.1:3100/api/v1/health
```

포트가 잘못되었거나 사용 중이면 실패 로그와 0이 아닌 종료 코드가 발생합니다. 포트를 바꾸거나 해당 포트를 사용하는 본인의 프로세스를 종료한 후 다시 실행합니다. `.env` 변경은 명령을 종료하고 다시 실행해 적용합니다.

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

공통 workspace는 `apps/*`, `packages/*`를 포함합니다. 서버는 `apps/api`, 클라이언트 예정 위치는 `apps/web`입니다. Vite와 Nginx의 `/api` 프록시는 경로를 제거하지 않고 `/api/v1/health`를 그대로 서버에 전달해야 합니다. Compose 내부 서버 주소는 `http://api:3000`이며, 로컬 개발은 `http://127.0.0.1:3000`입니다. 브라우저에서는 같은 origin의 `/api/v1/health`를 호출합니다. 성공 계약은 HTTP 200과 `{"status":"ok"}`이며 연결 실패·로딩 처리는 #9에서 구현합니다.

## 검증 범위

실행 결과는 [서버 초기 구성 검증 기록](server-verification.md)에 기록합니다. macOS arm64 로컬 개발, Docker linux/arm64와 GitHub Actions Ubuntu linux/amd64가 검증 목표입니다. 실제 통과한 환경만 완료로 기록하며 Windows와 그 밖의 OS·CPU, 공개 멀티 플랫폼 릴리스 이미지는 검증 범위에 포함하지 않습니다.
