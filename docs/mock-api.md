# 원천 Mock API 실행

외부 시스템 없이 수집 기능을 개발하기 위한 샘플 서버입니다. JSON 72건의 분할 반환, JSON 153건의 전체 반환, CSV 53행의 다운로드를 제공합니다. 실제 수집·가공·DB 저장은 별도 기능입니다.

## Docker로 실행

Docker와 Docker Compose 2.24.4 이상을 준비하고 저장소 루트에서 실행합니다. 호스트 Node.js·pnpm이나 외부 인증 정보는 필요하지 않습니다.

```sh
# mock-api만 실행
docker compose --profile mock up --build -d mock-api
# 세 서비스(web, api, mock-api) 실행
docker compose --profile mock up --build -d
# 상태 확인
docker compose --profile mock ps
# 종료·정리
docker compose --profile mock down --volumes
```

기본 `docker compose up --build -d`는 web·api만 실행합니다. mock은 선택한 경우에만 시작하며 API의 필수 의존성이 아닙니다. 이미 실행 중인 mock을 끄려면 `docker compose --profile mock stop mock-api`를 사용합니다. 프로필을 생략하는 것만으로 기존 컨테이너가 종료되지는 않습니다.

| 접근 위치 | 주소 |
| --- | --- |
| 호스트의 mock API | `http://127.0.0.1:3001` |
| api 컨테이너에서 mock API | `http://mock-api:3001` |
| 웹 | `http://localhost:8080` |

호스트 포트 충돌 시 `MOCK_PUBLISHED_PORT=4301 docker compose --profile mock up -d mock-api`로 바꿉니다. 컨테이너 내부 주소의 3001은 그대로입니다. API 컨테이너에서 호출할 수 있지만 자동 수집은 아직 구현하지 않았습니다.

```sh
docker compose --profile mock exec api node -e "fetch('http://mock-api:3001/sample1?limit=1').then(r => r.json()).then(console.log)"
```

## Docker 개발

```sh
docker compose -f compose.yaml -f compose.dev.yaml --profile mock up --build -d
docker compose -f compose.yaml -f compose.dev.yaml --profile mock logs -f mock-api
docker compose -f compose.yaml -f compose.dev.yaml --profile mock down --volumes
```

개발 모드는 mock 소스·fixture 변경을 감지해 빌드·복사·서버 재시작을 수행합니다. 웹은 HMR, API는 기존 Nest watch를 사용합니다. 빌드 이미지 실행 모드는 수정 후 다시 빌드해야 합니다. mock 이미지는 샘플과 운영 의존성을 포함하며 소스 마운트 없이 비루트 사용자로 실행합니다.

## 로컬 실행

저장소의 `.nvmrc`에 맞는 Node.js 24.19.0과 pnpm 10.34.5를 사용합니다.

```sh
pnpm install --frozen-lockfile
pnpm dev:mock
# 또는 빌드 후 실행
pnpm --filter @oss-scp/mock-api build
pnpm start:mock
```

Ctrl+C로 종료합니다. 기본 설정은 `MOCK_HOST=127.0.0.1`, `MOCK_PORT=3001`입니다. 로컬 실행 주소는 이 두 환경변수로 변경합니다. 포트는 1~65535 정수만 허용합니다. 잘못된 설정·포트 점유·fixture 누락·잘못된 JSON은 시작 실패로 처리합니다. 빌드가 복사한 `dist/fixtures`는 수정하지 않고 저장소의 `fixtures`를 수정합니다.

## 요청과 응답

### 분할 JSON

```sh
curl 'http://127.0.0.1:3001/sample1?offset=0&limit=20'
```

응답 구조는 `{ "total": 72, "rows": [...] }`입니다. `rows`에는 원본 레코드가 들어갑니다. offset=0·20·40·60에 각각 20·20·20·12건을 반환합니다. offset 기본값은 0, limit 기본값은 1000이며 limit 범위는 1~1000입니다. offset=72 이상이면 `{ "total": 72, "rows": [] }`를 반환합니다.

음수·소수·문자·빈 값·공백·지수 표기·반복 키·배열·안전 정수 초과·범위 밖 limit은 HTTP 400입니다. 관련 없는 쿼리 키는 무시합니다.

```sh
curl -i 'http://127.0.0.1:3001/sample1?limit=0'
```

오류 응답 예시: `{ "message": "Invalid limit", "error": "Bad Request", "statusCode": 400 }`.

### 전체 JSON

```sh
curl 'http://127.0.0.1:3001/sample2'
```

응답은 [sample2.json](../fixtures/sources/sample2.json) 전체입니다. items 153건의 중첩 객체·배열 및 최상위 test_field6을 유지합니다. 쿼리로 결과를 나누거나 변환하지 않습니다.

### CSV 다운로드

```sh
curl -f 'http://127.0.0.1:3001/vulnerabilities.csv' -o /tmp/mock-vulnerabilities.csv
cmp fixtures/csv/vulnerabilities.csv /tmp/mock-vulnerabilities.csv
```

`Content-Type: text/csv; charset=utf-8`와 `Content-Disposition: attachment; filename="vulnerabilities.csv"`를 반환합니다. 헤더·53행·소수 표기·줄바꿈을 원본 그대로 보존합니다. 없는 경로는 HTTP 404 JSON입니다.

## 자동 검증

```sh
pnpm --filter @oss-scp/mock-api test
pnpm test:process:mock
pnpm test:docker:mock
```

HTTP 테스트는 정상·오류·원본 일치·시작 실패를 확인합니다. 프로세스 테스트는 실행 디렉터리 독립성·변경 반영·종료를 검증합니다. Docker 테스트는 임시 소스 복사본과 별도 Compose 프로젝트를 사용해 단독 이미지, mock 단독, 세 서비스 통신, mock 중단, 개발 변경 반영을 확인한 뒤 컨테이너·볼륨을 정리합니다. Docker 검사를 실행하는 테스트 도구 자체에는 Node.js가 필요하지만 사용자 Docker 실행에는 필요하지 않습니다.

GitHub Actions의 로컬·Docker job에서도 이 검사를 실행합니다. 합성 샘플을 메모리에 읽는 작은 서버이며 실제 원천의 인증·동적 변경·대용량 처리 성능을 보장하는 용도가 아닙니다.

### 확인한 실행 환경

2026-09-09에 macOS arm64·Node.js 24.19.0·pnpm 10.34.5와 Docker linux/aarch64·Compose v5.3.1에서 로컬·Docker 검사를 통과했습니다. CI는 Ubuntu 24.04에서 실행하도록 구성했으며 이번 로컬 검증으로 linux/amd64나 Windows 실행을 확인한 것은 아닙니다.
