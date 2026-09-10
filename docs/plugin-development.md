# 샘플 플러그인 설정과 검증

`sample1-offset-api`와 `sample2-single-api`는 원천 mock API의 두 JSON 반환 방식을 설명하고, `vulnerabilities-local-csv`는 로컬 CSV 파일을 행 묶음으로 읽는 샘플 플러그인입니다. sample1은 offset·limit으로 나눠 받고, sample2는 전체 목록을 한 번에 받습니다. sample1의 실제 HTTP 수집은 [HTTP offset 수집 가이드](http-offset-collection.md)의 독립 수집 패키지로 실행할 수 있고, 로컬 CSV source는 공통 파서를 사용하는 수집 입력 실행까지 제공합니다.

## 파일 구성

```text
plugins/
├── registry.json
├── sample1-offset-api/
│   ├── plugin.json
│   └── source.json
├── vulnerabilities-local-csv/
│   ├── plugin.json
│   └── source.json
└── sample2-single-api/
    ├── plugin.json
    └── source.json
connections/
├── registry.json
├── mock-api-sample1.json
└── mock-api-sample2.json
packages/plugin-config/
├── schemas/
│   ├── plugin.schema.json
│   ├── source.schema.json
│   ├── source-offset.schema.json
│   ├── source-single.schema.json
│   └── connection.schema.json
└── src/
    ├── source-loader.ts
    └── source-loaders/
        ├── file.ts
        ├── offset.ts
        └── single.ts
```

`plugin.json`은 플러그인 ID·이름·릴리스 버전과 같은 폴더의 source 파일을 가리킵니다. sample1의 `source.json`은 `/sample1` 경로, GET, `rows`·`total` 응답 경로와 offset·limit 설정을 정의합니다. sample2의 `source.json`은 `/sample2` 경로, GET, `items` 응답 경로와 `single` 방식을 정의합니다.

CSV source는 설정 루트 기준 상대 파일 경로와 묶음 크기를 정의하며 Connection을 사용하지 않습니다.

두 플러그인은 서로 다른 원천 API 연결을 검증합니다. `mock-api-sample1`은 `http://127.0.0.1:3001`, `mock-api-sample2`는 `http://127.0.0.1:3002`를 제공합니다. 직접 호출할 때는 같은 mock 서버 프로그램을 서로 다른 포트의 독립 프로세스로 실행할 수 있지만, 플러그인 설정에서는 별도 Connection으로 취급합니다.

single 설정의 pagination에는 방식만 선언합니다.

```json
{
  "pagination": {
    "type": "single"
  }
}
```

single에는 offset·limit 파라미터나 전체 건수 경로를 추가하지 않습니다.

공통 `source-loader.ts`는 JSON source의 `pagination.type`을 판별하고 타입별 로더에 위임합니다. offset, single, file의 내부 정의 변환은 각각 별도 loader 파일에 있으며, offset과 single의 pagination 검증도 별도 schema 파일로 분리됩니다.

플러그인에 base URL이나 인증 값을 넣지 않습니다. 실제 인증이 필요한 Connection의 비밀 참조 계약은 후속 변경에서 정의합니다.

## 검증

Node.js 24.19.0과 pnpm 10.34.5를 준비하고 저장소 루트에서 실행합니다.

```sh
pnpm install --frozen-lockfile
pnpm validate:plugins
```

검증에 성공하면 다음 내용을 포함한 내부 수집 정의를 JSON으로 출력합니다.

- 플러그인: `sample1-offset-api`
- Connection: `mock-api-sample1`, `http://127.0.0.1:3001`
- 요청: `GET /sample1`, JSON
- 응답: 목록 `rows`, 전체 건수 `total`
- 반복 호출: `offset`, `limit`, 시작 0, 묶음 20건
- 실행 한도: 요청 5초, 응답 2MiB, 단일 레코드 256KiB
- 로컬 CSV: `fixtures/csv/vulnerabilities.csv`, 묶음 20건

sample2 내부 수집 정의에는 다음 값이 포함됩니다.

- 플러그인: `sample2-single-api`
- Connection: `mock-api-sample2`, `http://127.0.0.1:3002`
- 요청: `GET /sample2`, JSON
- 응답: 목록 `items`
- 수집 방식: `single`

이 명령은 네트워크를 호출하지 않으므로 mock API를 실행하거나 외부 자격증명을 준비할 필요가 없습니다. 파일 구조와 교차 참조만 검사합니다. 잘못된 설정은 파일·JSON 경로와 원인을 출력하고 0이 아닌 종료 코드로 끝납니다. 설정 원문과 비밀 값은 오류에 출력하지 않습니다.

자동 검증은 다음 명령으로 실행합니다.

```sh
pnpm --filter @oss-scp/plugin-config test
pnpm --filter @oss-scp/local-csv-source test
pnpm test:process:plugin-config
pnpm typecheck
pnpm lint
```

## 지원 범위

현재 유효한 source 계약은 `json + offset HTTP`, `json + single HTTP`, `csv + file`입니다. source 설정 파일은 플러그인 폴더 안의 상대 JSON 파일이어야 합니다. HTTP 메서드는 GET이고 offset의 묶음 크기는 1~1000입니다. 로컬 CSV의 데이터 파일은 저장소 설정 루트 안의 상대 `.csv` 경로만 허용하고 묶음 크기는 1~1000입니다.

설정 검증은 `itemsPath`가 가리키는 목록의 업무 필드나 응답 건수를 스키마에 고정하지 않습니다. 후속 single HTTP 수집·가공 단계는 sample2 항목의 `test_field2` 배열과 `test_field3` 객체뿐 아니라 목록 밖 최상위 `test_field6`에도 원천 구조대로 접근할 수 있어야 합니다. 이 문서의 검증 명령은 네트워크 응답을 읽지 않으므로 실제 전달 동작은 후속 single 수집 실행 작업에서 검증합니다.

`vulnerabilities.csv` HTTP 다운로드는 아직 유효한 지원값이 아닙니다. 로컬 CSV source의 실행 API와 완료·오류 의미는 [로컬 CSV source 가이드](local-csv-source.md)를 따릅니다.

이 설정을 사용한 offset HTTP 호출, 응답 스트리밍·크기 제한, timeout·취소와 처리 완료 대기는 구현되어 있습니다. single HTTP 호출, 가공, DB 저장과 영속 checkpoint는 후속 수집 작업에서 구현합니다. 로컬과 Docker처럼 실행 환경마다 Connection의 base URL을 선택하는 형식도 후속 배포 계약에서 확정합니다.

두 mock API를 로컬에서 직접 확인하려면 각각 다른 터미널에서 실행합니다.

```sh
MOCK_PORT=3001 pnpm start:mock
MOCK_PORT=3002 pnpm start:mock
```

그다음 `http://127.0.0.1:3001/sample1?offset=0&limit=20`과 `http://127.0.0.1:3002/sample2`를 호출합니다.
