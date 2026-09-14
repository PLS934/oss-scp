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

workspace 패키지를 추가할 때는 `compose.dev.yaml`의 `api`, `web`, `mock-api` 각각에 새 패키지의 `/workspace/<패키지 경로>/node_modules` 전용 named volume과 최상위 `volumes` 선언을 추가합니다. 각 서비스는 전체 workspace를 설치하므로 실행 앱 외의 패키지도 모두 격리해야 합니다. 서비스끼리 의존성 볼륨을 공유하지 않으며 pnpm store도 각 서비스의 루트 의존성 볼륨 안에 유지합니다.

`pnpm test:docker:workspace`는 컨테이너를 기동하지 않고 실제 pnpm 패키지 목록과 병합된 Compose 설정을 비교해 누락·공유를 검사합니다. 새 패키지를 추가하고 볼륨을 빠뜨린 경우도 회귀 검사합니다. 명시적 볼륨 목록은 일반 Compose 명령과 HMR을 유지하기 위해 사용하며, 자동 검사를 통해 목록 누락을 차단합니다. `pnpm test:docker:web`과 `pnpm test:docker:mock`은 실제 마운트·store 경로, 호스트 의존성 경로에 파일이 남지 않는지와 종료 후 컨테이너·볼륨·임시 소스 정리를 검사합니다. Docker가 만든 빈 mountpoint 디렉터리는 허용합니다. 같은 검사를 Ubuntu CI에서도 실행해 Linux 권한 처리까지 검증합니다.

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

## 저장 레코드 API 계층

`apps/web/src/records.ts`의 `listRecords`와 `getRecord`는 [저장 레코드 조회 API](record-query-api.md)를 화면에서 재사용하기 위한 타입 안전 경계입니다. 브라우저는 원천 API·DB·Connection에 직접 접근하지 않고 Vite 또는 Nginx가 전달하는 동일 출처 `/api/v1/records`만 요청합니다.

```ts
const first = await listRecords({
  pluginId: 'sample1',
  sourceId: 'sample-api',
  dataType: 'asset',
  limit: 20,
}, { signal: controller.signal });

if (first.ok && first.data.pageInfo.nextCursor) {
  const next = await listRecords({
    pluginId: 'sample1',
    sourceId: 'sample-api',
    dataType: 'asset',
    limit: 20,
    cursor: first.data.pageInfo.nextCursor,
  });
}
```

목록 함수는 `items`, `pageInfo.nextCursor`, `pageInfo.hasNextPage`, 최신 원천 단위 `collection` 상태와 `lastStoredAt`을 검증합니다. 첫 요청은 cursor를 생략하고 후속 요청은 서버가 반환한 불투명 `nextCursor`를 해석하거나 수정하지 않고 같은 범위와 묶음 크기로 전달합니다. 묶음 크기는 생략 시 서버 기본값 20을 사용하며 명시할 때는 20·50·100·200만 허용합니다. 빈 items와 `never_collected`는 정상 결과입니다.

두 함수는 예외 대신 `{ ok: true, data }` 또는 `{ ok: false, error }`를 반환합니다. 오류 `kind`는 입력 오류 `INVALID_INPUT`, cursor 오류 `INVALID_CURSOR`, 상세 없음 `NOT_FOUND`, DB 조회 불가 `NOT_READY`, 계약에 맞지 않는 응답 `INVALID_RESPONSE`, 네트워크 오류 `NETWORK_ERROR`, 취소 `ABORTED`, 나머지 API 실패 `API_ERROR`입니다. 오류에는 서버 응답 원문이나 내부 접속 정보가 포함되지 않습니다. 화면 전환이나 재요청 시 `AbortController`를 취소하고 `ABORTED` 결과로 화면 상태를 갱신하지 않아야 합니다.

API 계층 자체는 UI 상태, 캐시·자동 재시도·timeout을 제공하지 않습니다. 정확한 전체 건수, 임의 페이지 및 이전 cursor 이동, 검색·필터·사용자 지정 정렬도 현재 서버 계약과 클라이언트 함수의 범위가 아닙니다.

## 플러그인 기본 목록

등록된 메뉴 경로에서는 `apps/web/src/record-list.tsx`의 공통 목록이 route context와 검증된 `list.columns`를 결합합니다. 플러그인별 React 목록 코드는 만들지 않습니다. 화면은 columns 순서와 표시명을 사용하며 `sourceValues` 중 선언된 최상위 scalar 필드만 표시합니다. string은 그대로, number와 datetime은 한국어 locale, boolean은 `예`·`아니요`로 표현하고 null·누락·타입 불일치는 `—`로 표시합니다. 응답에 함께 온 미선언 필드, `omittedFields`, 큰 본문, 원천 설정과 Connection 정보는 렌더링하지 않습니다.

첫 요청은 cursor 없이 20건을 읽습니다. 화면에서 20·50·100·200건 중 묶음 크기를 선택할 수 있으며 변경하면 기존 cursor를 버리고 첫 묶음부터 다시 조회합니다. `hasNextPage`가 true일 때만 서버의 불투명 `nextCursor`로 다음 묶음을 조회하고 현재 표를 새 묶음으로 교체합니다. 이전 묶음 복귀와 임의 페이지 이동은 아직 지원하지 않습니다. 메뉴 이동이나 조건 변경 중인 요청은 취소하고 늦은 응답을 무시합니다.

목록은 로딩, 미수집, 정상 빈 결과, 수집 중, 마지막 실행 실패·부분 완료와 API 조회 실패를 구분합니다. 수집 중·실패·부분 완료 응답에 저장된 items가 있으면 상태 안내와 함께 기존 데이터를 계속 표시합니다. 조회 실패의 `다시 시도`는 같은 조회 범위·묶음·cursor를 재요청합니다. 검색·필터·사용자 지정 정렬, 개인 컬럼 선택·순서·너비, 중첩 object·array 고급 표시와 사용자 정의 React 화면은 후속 범위입니다.

각 행의 `보기`는 원천 `externalKey`가 아니라 저장 레코드의 내부 UUID를 현재 메뉴 경로에 붙여 상세 화면으로 이동합니다. 상세 URL은 직접 열거나 새로고침해도 같은 메뉴 조회 범위를 복원하며, `목록으로 돌아가기`는 해당 메뉴의 목록으로 이동합니다.

## 플러그인 기본 상세

공통 상세 화면은 검증된 `detail.sections` 순서와 표시명으로 `sourceValues`의 선택된 최상위 필드만 렌더링합니다. string·number·boolean·datetime은 선언 타입을 확인하고, object·array는 #67의 flat 계약에 맞춰 React 텍스트 노드로 일반 JSON 구조를 표시합니다. HTML을 해석하거나 플러그인 코드를 실행하지 않습니다. null은 `값 없음`, key 누락은 `필드 누락`, 타입 불일치는 `표시할 수 없는 값`으로 서로 구분합니다.

상세 API 응답의 `pluginId`, `sourceId`, `dataType`이 현재 메뉴와 모두 일치할 때만 값을 표시합니다. 잘못된 UUID는 요청 전에 차단하고, 없는 레코드와 범위 불일치, 그 밖의 조회 실패를 구분합니다. 일반 실패는 같은 요청을 다시 시도할 수 있습니다.

flat 상세 계약은 object·array의 중첩 키별 선택을 제공하지 않으므로 선택된 구조 값의 하위 항목은 모두 일반 표현에 포함됩니다. 플러그인 작성자는 비밀정보나 큰 본문을 가진 최상위 필드를 상세 정의에 넣지 않아야 합니다. 큰 본문 다운로드, 관계 탐색, 수정, 전용 위젯과 사용자 정의 React 상세 화면은 지원 범위가 아닙니다.

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

## 화면 테마

사이드바의 **화면 테마**에서 시스템 설정·라이트·다크를 선택한다. 기본값은 시스템 설정이며, 이 모드에서는 운영체제 색상 설정 변경을 즉시 반영한다. 라이트·다크를 직접 선택하면 운영체제 변경과 무관하게 유지한다.

선택은 현재 브라우저의 해당 출처에 `oss-scp.theme` 키로 저장되어 새로고침·재방문 시 복원된다. 계정이나 다른 브라우저와 동기화하지 않는다. 저장소 접근이 차단되거나 쓰기가 실패해도 현재 화면의 테마 변경은 사용할 수 있지만 다음 방문까지 유지되지 않을 수 있다. 잘못된 저장값은 시스템 설정으로 처리한다.

초기 문서에서 앱 모듈 실행 전에 테마와 배경을 적용해 첫 표시의 색상 깜빡임을 방지한다. 공통 화면과 플러그인 정의 기반 목록·상세는 `apps/web/src/style.css`의 의미 기반 CSS custom properties를 사용한다. 새 UI에는 고정 색상 대신 텍스트·표면·상태·경계·포커스 토큰을 적용하고 두 테마의 대비를 확인한다. `pnpm --filter @oss-scp/web test`와 `pnpm test:browser`에 결정·복원·시스템 변경·초기 표시·대비 회귀 검증이 포함된다.

테마 버튼은 적용된 라이트 모드에서는 태양, 다크 모드에서는 달 아이콘을 표시합니다. 누르면 시스템·라이트·다크 선택 팝오버가 열리고 Escape 또는 바깥 클릭으로 닫힙니다. 선택 후 포커스는 아이콘 버튼으로 돌아옵니다.
