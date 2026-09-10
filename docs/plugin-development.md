# 샘플 플러그인 설정과 검증

`sample1-offset-api`는 원천 mock API의 `sample1.json` 분할 반환 경로를 설명하는 첫 샘플 플러그인입니다. 실제 HTTP 요청이나 데이터 가공·저장은 실행하지 않고, 후속 수집기가 사용할 설정을 배포 전에 검증합니다.

## 파일 구성

```text
plugins/
├── registry.json
└── sample1-offset-api/
    ├── plugin.json
    └── source.json
connections/
├── registry.json
└── mock-api.json
packages/plugin-config/
└── schemas/
    ├── plugin.schema.json
    ├── source.schema.json
    └── connection.schema.json
```

`plugin.json`은 플러그인 ID·이름·릴리스 버전과 같은 폴더의 source 파일을 가리킵니다. `source.json`은 `/sample1` 경로, GET, `rows`·`total` 응답 경로와 offset·limit 설정을 정의합니다. `mock-api.json`은 환경별 base URL을 제공합니다.

플러그인에 base URL이나 인증 값을 넣지 않습니다. 실제 인증이 필요한 Connection의 비밀 참조 계약은 후속 변경에서 정의합니다.

## 검증

Node.js 24.19.0과 pnpm 10.34.5를 준비하고 저장소 루트에서 실행합니다.

```sh
pnpm install --frozen-lockfile
pnpm validate:plugins
```

검증에 성공하면 다음 내용을 포함한 내부 수집 정의를 JSON으로 출력합니다.

- 플러그인: `sample1-offset-api`
- Connection: `mock-api`, `http://127.0.0.1:3001`
- 요청: `GET /sample1`, JSON
- 응답: 목록 `rows`, 전체 건수 `total`
- 반복 호출: `offset`, `limit`, 시작 0, 묶음 20건

이 명령은 네트워크를 호출하지 않으므로 mock API를 실행하거나 외부 자격증명을 준비할 필요가 없습니다. 파일 구조와 교차 참조만 검사합니다. 잘못된 설정은 파일·JSON 경로와 원인을 출력하고 0이 아닌 종료 코드로 끝납니다. 설정 원문과 비밀 값은 오류에 출력하지 않습니다.

자동 검증은 다음 명령으로 실행합니다.

```sh
pnpm --filter @oss-scp/plugin-config test
pnpm test:process:plugin-config
pnpm typecheck
pnpm lint
```

## 지원 범위

현재 유효한 source 계약은 `json + offset` 한 가지입니다. source 경로는 플러그인 폴더 안의 상대 JSON 파일이어야 하며 HTTP 메서드는 GET, 묶음 크기는 1~1000입니다.

`sample2.json`의 단일 JSON 응답과 `vulnerabilities.csv` HTTP 다운로드는 아직 유효한 지원값이 아닙니다. 후속 작업에서 각각 별도 플러그인과 source 방식으로 추가하며, 기존 sample1 플러그인은 수정하지 않습니다.

이 설정을 사용한 실제 묶음 수집은 #15에서 구현합니다. 로컬의 `127.0.0.1`과 Docker 내부의 `mock-api`처럼 실행 환경마다 다른 Connection을 선택하는 형식도 실제 HTTP 수집 계약에서 확정합니다.
