# 클라이언트 개발·실행 가이드

`apps/web`의 React 시작 화면은 앱 제목과 서버 연결 상태를 표시합니다. 로그인·DB·외부 자격증명 없이 실행하며 샘플 데이터 초기화는 아직 없습니다. 상태 확인은 `/api/v1/health`를 호출하고 5초 안에 정상 응답이 없으면 실패로 표시합니다. 복구 후 페이지를 새로고침하면 다시 확인합니다.

## 실행 경로

| 목적 | 실행 방식 | 웹 접속 | 소스 변경 |
| --- | --- | --- | --- |
| 로컬 개발 | Node.js와 pnpm | 실행 컴퓨터의 `http://localhost:5173` | Vite HMR·NestJS watch |
| Docker 개발 | 기본 Compose + 개발 설정 | 실행 컴퓨터의 `http://localhost:8080` | Vite HMR·NestJS watch |
| 배포 형태 실행 | 기본 Compose | `http://<실행 컴퓨터 IP>:8080` | 이미지 재빌드 후 반영 |

모든 명령은 저장소 루트에서 실행합니다. 개발과 배포 Compose는 같은 포트를 사용하므로 한쪽을 종료한 뒤 전환합니다. `compose.dev.yaml`은 단독 사용하지 않습니다.

## 도구 버전

| 도구 | 고정 버전 |
| --- | --- |
| Node.js / pnpm | 24.19.0 / 10.34.5 |
| React / React DOM | 19.2.8 |
| Vite / React 플러그인 | 8.2.2 / 6.1.1 |
| TypeScript / Vitest | 5.9.3 / 4.1.11 |
| Playwright | 1.63.0 |
| Nginx 이미지 | nginxinc/nginx-unprivileged:1.30.1-alpine |
| Docker Compose | 2.24.4 이상 (`!override` 지원 필요) |

[React의 Vite 안내](https://react.dev/learn/build-a-react-app-from-scratch), [Vite 런타임 조건](https://vite.dev/guide/), 고정 패키지의 registry `engines`·`peerDependencies`를 확인했습니다. Node.js 24를 사용하고 React 플러그인의 Vite 8 조건을 맞췄으며 TypeScript·Vitest는 서버와 버전을 공유합니다. 정확한 의존성은 `pnpm-lock.yaml`로 고정합니다. [Compose의 목록 교체](https://docs.docker.com/reference/compose-file/merge/)를 사용해 개발 시 배포 웹 포트가 남지 않도록 합니다. [Nginx proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)의 변수와 resolver로 API가 없어도 정적 서버를 실행합니다.

## 로컬 개발

Node.js 24.19.0 설치 후 실행합니다. nvm 사용자는 `nvm install`과 `nvm use`로 `.nvmrc`를 적용할 수 있습니다.

```sh
npm install --global pnpm@10.34.5
pnpm install --frozen-lockfile
pnpm dev
```

두 번째 터미널에서 실행합니다.

```sh
pnpm dev:web
```

`http://localhost:5173`에서 확인합니다. 서버가 없어도 화면은 열리며 연결 실패를 표시합니다. 각 터미널의 `Ctrl+C`로 종료합니다. 웹 소스는 HMR로, 서버 소스는 자동 재시작 후 반영됩니다. 개발 포트가 사용 중이면 다른 포트로 자동 이동하지 않고 실패합니다.

## Docker 개발

Docker와 Compose만 있으면 됩니다. 호스트 Node.js·pnpm은 필요하지 않습니다.

```sh
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

최초 기동 시 컨테이너 내부에서 잠금 파일에 맞춰 의존성을 설치합니다. 두 서비스가 준비되면 `http://localhost:8080`에서 확인합니다. 호스트 소스를 수정하면 화면과 서버에 자동 반영됩니다. 컨테이너의 의존성은 별도 볼륨에 보관하며 호스트 node_modules를 사용하지 않습니다. 서버 개발 빌드는 전용 tsconfig로 의존성 볼륨 안에 출력하여 호스트 배포 산출물을 덮어쓰지 않습니다.

패키지 선언·잠금 파일을 바꿨다면 재시작으로 재설치합니다.

```sh
docker compose -f compose.yaml -f compose.dev.yaml restart api web
```

파일 감지가 동작하지 않는 환경에서는 다음 설정으로 실행합니다.

```sh
WATCH_POLLING=true TSC_WATCHFILE=DynamicPriorityPolling docker compose -f compose.yaml -f compose.dev.yaml up --build
```

종료와 개발 의존성 초기화:

```sh
docker compose -f compose.yaml -f compose.dev.yaml down
# 개발 의존성 볼륨까지 정리. 다음 시작 시 다시 설치합니다.
docker compose -f compose.yaml -f compose.dev.yaml down -v
```

## 배포 형태 실행

```sh
docker compose up --build -d --wait
docker compose logs -f
```

실행한 컴퓨터에서는 `http://localhost:8080`, 다른 컴퓨터에서는 `http://<실행 컴퓨터 IP>:8080`으로 접속합니다. 네트워크가 연결되어 있고 실행 컴퓨터의 방화벽에서 웹 포트를 허용해야 합니다. 다른 컴퓨터에서 localhost는 그 컴퓨터 자신을 의미합니다. 공유기나 방화벽 설정은 자동 변경하지 않습니다.

Nginx는 정적 파일을 제공하고 `/api`를 서버로 전달합니다. 배포 웹 포트는 외부 인터페이스에 공개하며 API의 직접 공개 포트는 기존대로 loopback에 제한합니다. 브라우저는 같은 웹 출처로 API를 요청하므로 방문자 컴퓨터의 localhost를 API 주소로 사용하지 않습니다. 서버가 중단되어도 정적 화면을 제공하고 실패를 안내합니다.

```sh
docker compose down
```

이미지만 빌드하고 단독 실행할 수도 있습니다.

```sh
docker build -f apps/web/Dockerfile -t oss-scp-web:local .
docker run --rm --name oss-scp-web-demo -p 8080:8080 oss-scp-web:local
# 별도 터미널에서 종료
docker stop oss-scp-web-demo
```

단독 실행은 API가 없어도 화면을 제공하며 연결 실패를 표시합니다. 실제 API와 연결하려면 같은 Docker 네트워크에서 실행하고 `-e API_UPSTREAM=<API 호스트>:<포트>`를 지정합니다. 서버 주소 변경에 웹 이미지 재빌드는 필요하지 않습니다. 아직 공개 레지스트리의 릴리스 이미지는 제공하지 않습니다.

## 환경변수

루트 `.env.example`을 참고합니다. 설정 없이 기본 실행이 가능하며 필요하면 `cp .env.example .env`로 복사합니다.

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| WEB_PORT | 8080 | Docker 웹 호스트 포트, 개발 시 loopback 제한 |
| API_PORT | 3000 | Docker API 호스트 포트 |
| API_UPSTREAM | api:3000 | 배포 Nginx에서 사용하는 host:port |
| API_PROXY_TARGET | http://127.0.0.1:3000 | 로컬 Vite 프록시, Docker 개발에서는 http://api:3000 |
| WATCH_POLLING | false | Docker 개발 Vite 파일 감지 대안 |
| TSC_WATCHFILE | UseFsEvents | Docker 개발 TypeScript 파일 감지 방식 |

로컬 서버 포트를 바꾸면 `API_PROXY_TARGET`도 맞춰야 합니다. 이 설정은 프록시 서버에서 사용하고 브라우저 번들에 비밀정보를 넣지 않습니다. 개발 웹 포트는 로컬 `pnpm dev:web --port 5174`로 변경할 수 있습니다.

## 검증

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:process
pnpm exec playwright install --with-deps chromium
pnpm test:browser
pnpm test:docker:web
pnpm test:docker
```

[서버·클라이언트 통합 CI](../.github/workflows/integration-ci.yaml)는 같은 명령을 Ubuntu 24.04 linux/amd64에서 실행하도록 구성합니다. 브라우저 검사는 임시 복사본에서 화면을 수정해 HMR을 확인합니다. Docker 검사는 별도 Compose 프로젝트에서 배포·개발 실행, API 중단·재생성, 다른 upstream, 의존성 재설치, 호스트 포트 접근 범위를 확인하고 자원을 정리합니다. 여러 네트워크 인터페이스가 있으면 `TEST_HOST_ADDRESS=<호스트 IPv4> pnpm test:docker:web`으로 검사 주소를 지정할 수 있습니다. 브라우저 테스트에는 Node.js가 필요하지만 사용자 Docker 실행 경로에는 필요하지 않습니다.

실제 실행 결과와 OS·CPU 및 외부 접속 검증의 한계는 [이슈 9 검증 기록](client-verification.md)에 기록합니다. CI를 실행하도록 구성한 것과 원격 CI가 통과한 것은 구분합니다.
