# 샘플 플러그인 설정과 검증

`sample1-offset-api`와 `sample2-single-api`는 원천 mock API의 두 JSON 반환 방식을 설명합니다. `vulnerabilities-local-csv`와 `vulnerabilities-http-csv`는 같은 CSV를 각각 로컬 파일과 HTTP 다운로드로 획득해 공통 파서로 처리합니다. JSON 수집은 [HTTP JSON 수집 가이드](http-offset-collection.md), 다운로드 CSV는 [HTTP CSV source 가이드](http-csv-source.md)를 따릅니다.

## 파일 구성

```text
plugins/
├── registry.json
├── sample1-offset-api/
│   ├── plugin.json
│   ├── source.json
│   ├── transform.ts
│   └── dist/transform.js
├── vulnerabilities-local-csv/
│   ├── plugin.json
│   ├── source.json
│   ├── transform.ts
│   └── dist/transform.js
├── vulnerabilities-http-csv/
│   ├── plugin.json
│   ├── source.json
│   ├── transform.ts
│   └── dist/transform.js
└── sample2-single-api/
    ├── plugin.json
    ├── source.json
    ├── transform.ts
    └── dist/transform.js
connections/
├── registry.json
├── mock-api-sample1.json
├── mock-api-vulnerabilities-csv.json
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

`plugin.json`은 플러그인 ID·이름·릴리스 버전, 같은 폴더의 source와 빌드된 transform 파일, 데이터 종류·필드·유일키·관계, 메뉴와 기본 목록을 정의합니다. sample1의 `source.json`은 `/sample1` 경로, GET, `rows`·`total` 응답 경로와 offset·limit 설정을 정의합니다. sample2의 `source.json`은 `/sample2` 경로, GET, `items` 응답 경로와 `single` 방식을 정의합니다.

## 홈의 등록 정보

`GET /api/v1/plugins`는 기동 시 검증한 registry에서 등록 순서대로 `id`, `name`, 선택적 `description`, `enabled`, `sourceType`와 출처 상세 정보를 제공합니다. HTTP 출처의 `endpoint`는 정제된 `url`과 `method`이며, CSV 출처의 `fileName`은 파일명입니다. `sourceType`은 source 설정에서 도출한 `http-json`(외부 API), `http-csv`(외부 HTTP CSV), `local-csv`(로컬 CSV)입니다. HTTP 주소는 서버 주소와 요청 경로를 표시하되 URL 인증정보·query·fragment는 제거합니다. Connection 원문, 서버 파일 절대 경로, transform 경로와 인증정보는 포함하지 않습니다. 이름과 설명은 공개 표시 정보이므로 비밀정보를 넣지 않습니다.

`plugin.json`에 선택적으로 `description`(최대 2,000자)과 `enabled`(boolean)를 지정할 수 있습니다. 기존 설정에서 `enabled`를 생략하면 `true`로 동작합니다. `false`인 플러그인은 등록 목록에는 남지만 수집 정의와 메뉴에서 제외되어 시작 수집·수동 수집 대상이 되지 않으며 transform 모듈을 로딩하지 않습니다. 비활성 설정도 기본 schema, 데이터·메뉴 참조, source schema 및 transform 파일 존재 검증은 통과해야 합니다.

홈은 이름·설명·출처 유형·설정상 활성화 여부를 표시하고, 활성 플러그인의 조회 가능한 메뉴를 기존 `/api/v1/plugin-menus` 응답과 ID로 연결합니다. 복수 메뉴 응답은 메뉴 제목별 링크로 구분합니다. 현재 `plugin.json`의 메뉴 선언은 최대 하나이며 이 변경에서 배열 선언을 추가하지 않습니다. 설명이 없거나 공백뿐이면 설명 영역을 생략합니다. 메뉴 위치는 플러그인 이름 아래에 `{메뉴 그룹} > {메뉴 이름}`으로 표시하고 조회 링크는 제목 옆 아이콘으로 제공합니다. 비활성, 메뉴 없음, 로딩, 조회 실패, 빈 registry는 각각 안내합니다. 등록 여부와 활성화는 원천 연결이나 수집 성공을 뜻하지 않습니다.

활성 로컬 CSV 카드의 파일명 오른쪽 **다운로드 아이콘**은 `GET /api/v1/plugins/:id/source-file`로 현재 등록 파일을 변환 없이 내려받습니다. 수집 시점의 보관본이 아니며 API JSON과 HTTP CSV는 다운로드를 제공하지 않습니다. 응답은 CSV attachment이고 `Cache-Control: no-store`를 적용합니다. 서버는 클라이언트 경로를 받지 않고 등록 정의만 사용하며 실제 파일이 설정 루트 내부의 일반 파일인지 재확인합니다. source `maxBytes`(생략 시 1 GiB)를 초과하면 413, 대상 없음·비활성·파일 누락·루트 이탈·읽기 불가는 내부 경로 없는 404로 응답합니다.

설정 편집·활성화 전환 UI와 수집 이력 표시는 제공하지 않습니다. 기존 설정은 변경 없이 호환되며, 새 선택 필드를 사용한 설정은 이 필드를 지원하는 서버와 함께 배포해야 합니다. 새 홈은 `/api/v1/plugins`를 제공하는 서버가 필요합니다.

## 메뉴와 라우팅

플러그인은 하나의 메뉴를 선택적으로 선언합니다. 메뉴를 생략하면 수집은 가능하지만 사이드바와 홈의 데이터 조회 링크에는 표시되지 않습니다. `dataType`은 같은 파일의 `data.types` 키를 참조하며, `path`는 소문자 영숫자와 하이픈으로 이루어진 절대 경로입니다.

```json
{
  "menu": {
    "title": "서버 자산",
    "icon": "server",
    "group": "자산 관리",
    "order": 10,
    "path": "/assets/servers",
    "dataType": "asset"
  }
}
```

지원 아이콘은 `server`, `shield`, `repository`입니다. 서로 다른 플러그인이 같은 경로를 선언하거나 존재하지 않는 데이터 종류·아이콘을 참조하면 배포 전 검증이 실패합니다. 메뉴는 registry의 등록 순서가 아니라 그룹 이름, 숫자 `order`, 제목, 경로 순으로 정렬됩니다.

운영자 Git revision의 `plugins/`, `connections/`와 각 `registry.json`이 구조의 유일한 원본입니다. 운영 환경에는 TypeScript 원본이 아니라 사전 빌드된 JavaScript 가공 모듈을 배포하고, 대상 플랫폼 이미지의 검증 명령으로 전체 설정과 모듈 export를 확인합니다. 브라우저는 API가 기동 시 검증한 `/api/v1/plugin-menus` 결과만 읽으며 메뉴 구조를 생성하거나 수정하지 않습니다.

## 필드 표시명과 기본 목록·상세

모든 scalar·object·array 필드와 중첩된 `items`·`fields`에는 비어 있지 않은 `label`을 선언합니다. 각 데이터 종류의 `views.list.columns`에는 기본 목록에 표시할 최상위 scalar 필드 key를 원하는 순서대로 하나 이상 선언합니다. `views.detail.sections`에는 상세 화면의 섹션 제목과 최상위 필드 key를 표시 순서대로 선언합니다.

```json
{
  "uniqueKey": "hostname",
  "views": {
    "list": {
      "columns": ["hostname", "environment", "enabled"]
    },
    "detail": {
      "sections": [
        { "title": "기본 정보", "fields": ["hostname", "environment"] },
        { "title": "상세 구성", "fields": ["enabled", "details"] }
      ]
    }
  },
  "fields": {
    "hostname": { "type": "string", "label": "호스트명", "required": true },
    "environment": { "type": "string", "label": "환경", "required": true },
    "enabled": { "type": "boolean", "label": "활성 상태", "required": true },
    "details": {
      "type": "object",
      "label": "상세 정보",
      "fields": {
        "observedAt": { "type": "datetime", "label": "관측 시각" }
      }
    }
  }
}
```

목록 column은 같은 데이터 종류에 존재하는 `string`, `number`, `boolean`, `datetime` 필드만 참조할 수 있습니다. 존재하지 않는 key나 `details` 같은 object·array를 참조하면 해당 `columns` 배열 위치와 원인을 포함한 오류가 발생합니다. 빈 배열과 중복 key는 JSON Schema 검증에서 거부됩니다. object·array를 기본 목록에 표시하는 계약은 중첩 렌더링 작업에서 별도로 정의합니다.

상세 section은 하나 이상의 필드를 가져야 하며 제목은 같은 데이터 종류에서 고유해야 합니다. 상세 필드는 같은 데이터 종류의 최상위 `string`, `number`, `boolean`, `datetime`, `object`, `array` 필드를 참조할 수 있지만, 같은 필드를 한 section 또는 여러 section에 중복 선언할 수 없습니다. 존재하지 않거나 중복된 필드는 두 번째 문제 참조의 `sections/{sectionIndex}/fields/{fieldIndex}` 경로와 함께 거부됩니다. 선언된 모든 필드를 상세에 포함할 필요는 없습니다.

검증된 `/api/v1/plugin-menus` 응답은 각 메뉴에 다음처럼 선택된 목록 column과 상세 section의 `key`, `label`, `type`만 포함합니다. 선택하지 않은 필드, object·array의 중첩 schema, source 요청, Connection과 transform 경로는 브라우저에 전달하지 않습니다.

```json
{
  "pluginId": "sample1-offset-api",
  "sourceId": "mock-api-sample1",
  "dataType": "asset",
  "list": {
    "columns": [
      { "key": "hostname", "label": "호스트명", "type": "string" },
      { "key": "environment", "label": "환경", "type": "string" },
      { "key": "enabled", "label": "활성 상태", "type": "boolean" }
    ]
  },
  "detail": {
    "sections": [
      {
        "title": "기본 정보",
        "fields": [
          { "key": "hostname", "label": "호스트명", "type": "string" },
          { "key": "environment", "label": "환경", "type": "string" }
        ]
      },
      {
        "title": "상세 구성",
        "fields": [
          { "key": "enabled", "label": "활성 상태", "type": "boolean" },
          { "key": "details", "label": "상세 정보", "type": "object" }
        ]
      }
    ]
  }
}
```

## 사용자 정의 React 목록·상세

공통 목록이나 상세 표현으로 부족한 플러그인은 플랫폼 웹 소스의 `apps/web/src/custom-plugin-views.tsx` registry에 React 컴포넌트를 정적으로 등록할 수 있습니다. registry key는 `plugin.json`의 `id`와 같아야 하며 `List`와 `Detail`은 서로 독립적으로 생략할 수 있습니다.

```tsx
export const customPluginViews: CustomPluginViewRegistry = {
  'sample2-single-api': {
    List: Sample2RepositoryList,
    Detail: Sample2RepositoryDetail,
  },
};
```

`List`는 `{ menu }`, `Detail`은 `{ menu, recordId }`를 받습니다. `menu`는 서버가 기동 시 검증하여 `/api/v1/plugin-menus`로 공개한 `pluginId`, `sourceId`, `dataType`, 목록 columns와 상세 sections를 포함합니다. 상세의 `recordId`는 현재 메뉴 아래의 URL에서 플랫폼 router가 해석한 값입니다. 사용자 정의 화면은 `apps/web/src/records.ts`의 공개 조회 클라이언트와 기존 API를 사용하며, 원천 Connection이나 서버 전용 설정을 입력으로 받지 않습니다. 서버의 조회 범위와 권한 검사는 사용자 정의 화면에도 동일하게 적용됩니다.

등록하지 않은 화면 종류는 기존 공통 `RecordList` 또는 `RecordDetail`로 표시됩니다. 사용자 정의 화면의 렌더링 예외는 해당 route 영역에 안전한 안내로 표시되며 shell과 다른 플러그인 메뉴는 계속 동작합니다. 비동기 조회 실패, 로딩·빈 결과와 키보드 접근성은 사용자 정의 컴포넌트가 처리해야 합니다.

현재 사용자 정의 화면은 플랫폼과 같은 React·라우터 버전을 사용하며 배포용 웹 자산에 함께 빌드됩니다. 화면을 추가하거나 변경하면 웹 이미지를 다시 빌드해야 합니다. 외부 플러그인 설정의 React 소스나 프론트엔드 번들을 런타임에 로드하지 않으며, 독립 UI 빌드·배포는 후속 #94 범위입니다.

## 설정과 가공 모듈 검증

```bash
pnpm build:plugin-transforms
pnpm --filter @oss-scp/plugin-config build
OSS_SCP_CONFIG_ROOT="$PWD" node packages/plugin-config/dist/cli.js
```

플랫폼은 운영 중 TypeScript를 변환하거나 플러그인별 패키지를 설치하지 않습니다. 외부 플러그인은 선언형 메뉴·목록·상세만 제공하며 `List.tsx`·`Detail.tsx` 같은 사용자 정의 화면은 플랫폼과 함께 빌드합니다.

## 데이터 가공 코드

가공 코드는 `@oss-scp/plugin-sdk`의 `Transform` 타입을 사용하고 원천 레코드 한 건마다 호출됩니다. TypeScript 원본은 빌드 시 `dist/transform.js`로 변환되며 런타임은 등록·검증된 JavaScript만 동적 import합니다.

```ts
import type { Transform } from '@oss-scp/plugin-sdk';

export const transform: Transform = ({ record, context }) => ({
  records: [{
    type: 'asset',
    values: { id: String((record as Record<string, unknown>).id) },
  }],
  relations: [],
});
```

입력 context에는 플러그인·수집처 식별자, 수집 시각, 취소 신호와 source 계약이 허용한 제한된 응답 metadata만 있습니다. DB 세션, NestJS 객체, Connection 비밀과 원본 HTTP 응답 전체는 전달하지 않습니다. 가공 결과의 알 수 없는 필드, 필수 필드·타입 오류, 비어 있거나 중복된 유일키와 잘못된 관계는 공통 검증에서 거부됩니다.

한 원천 레코드의 출력 일부가 실패하면 같은 호출의 레코드·관계 전체를 격리하지만 다른 원천 레코드는 계속 처리합니다. 이 경우 결과는 `success`가 아니라 `partial`입니다. 원천 레코드 전체나 transform이 던진 임의 메시지는 공개 오류에 포함하지 않습니다.

- sample1: 기본 필드명 매핑과 number·boolean 결과를 검증합니다.
- sample2: 중첩 object·array와 최상위 `test_field6`의 제한된 metadata 전달을 검증합니다.
- 로컬 CSV: 문자열을 가공 코드에서 number·boolean·datetime으로 명시적으로 변환합니다. 코어는 원천 문자열을 암묵적으로 바꾸지 않습니다.

한 원천 레코드 출력은 레코드 100개, 관계 200개, 중첩 깊이 8, 배열 요소 1,000개와 JSON 1 MiB로 제한됩니다. 저장 입력 묶음은 레코드 100개 또는 JSON 1 MiB 중 먼저 도달하는 기준으로 전달하며 소비 완료를 기다립니다. Git PR로 승인된 플러그인을 같은 Node.js 프로세스에서 실행하므로 비신뢰 코드 sandbox와 동기 무한 루프 강제 종료는 지원하지 않습니다.

로컬 CSV source는 설정 루트 기준 상대 파일 경로와 묶음 크기를 정의하며 Connection을 사용하지 않습니다. HTTP CSV source는 환경별 base URL의 Connection을 참조하고 상대 요청 경로, 묶음과 전송·파싱 한도를 정의합니다.

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
pnpm build
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
- HTTP CSV: `mock-api-vulnerabilities-csv`, `GET /vulnerabilities.csv`, 묶음 20건, wire/해제 후/레코드 한도

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
pnpm --filter @oss-scp/collection-engine test
pnpm --filter @oss-scp/local-csv-source test
pnpm test:http-csv-source
pnpm test:process:plugin-config
pnpm typecheck
pnpm lint
```

## 지원 범위

현재 유효한 source 계약은 `json + offset HTTP`, `json + single HTTP`, `csv + file`, `csv + HTTP`입니다. source 설정 파일은 플러그인 폴더 안의 상대 JSON 파일이어야 합니다. HTTP 메서드는 GET이고 모든 묶음 크기는 1~1000입니다. 로컬 CSV의 데이터 파일은 저장소 설정 루트 안의 상대 `.csv` 경로만 허용합니다.

설정·가공 코어는 `itemsPath`가 가리키는 목록의 업무 필드나 응답 건수를 고정하지 않습니다. sample2 HTTP 통합 검증은 `test_field2` 배열과 `test_field3` 객체를 보존하고 목록 밖 최상위 `test_field6`만 제한된 metadata로 전달합니다.

로컬 CSV source의 완료·오류 의미는 [로컬 CSV source 가이드](local-csv-source.md), `vulnerabilities.csv` HTTP 다운로드의 실행·한도·오류 의미는 [HTTP CSV source 가이드](http-csv-source.md)를 따릅니다.

이 설정을 사용한 JSON offset·single과 CSV HTTP 호출, 응답 수신·크기 제한, timeout·취소와 처리 완료 대기가 구현되어 있습니다. HTTP CSV의 가공 실행, DB 저장과 영속 checkpoint 연결은 후속 수집·저장 작업에서 구현합니다.

10,000건을 100건씩 반복 처리하는 기준에서는 실행기가 완료된 출력 전체를 보관하지 않고 소비자 완료 후 다음 묶음으로 진행해야 합니다. 자동화 테스트는 250건 입력에서 소비 묶음이 `100, 100, 50`으로 제한되는지 확인하며, 실제 메모리 수치는 Node.js·OS에 따라 달라져 절대 RSS 값 대신 묶음 상한과 전체 결과 비누적을 회귀 기준으로 사용합니다.

두 mock API를 로컬에서 직접 확인하려면 각각 다른 터미널에서 실행합니다.

```sh
MOCK_PORT=3001 pnpm start:mock
MOCK_PORT=3002 pnpm start:mock
```

그다음 `http://127.0.0.1:3001/sample1?offset=0&limit=20`과 `http://127.0.0.1:3002/sample2`를 호출합니다.

## 목록 검색·필터 선언

최상위 기본 목록 `columns`에 포함된 string 필드는 `searchable: true`로 검색을 허용한다. scalar 필드는 `filter`로 사용할 입력을 명시한다. 선언을 생략하면 기존 목록을 유지한다.

```json
{
  "name": { "type": "string", "label": "취약점명", "searchable": true },
  "affected": {
    "type": "boolean", "label": "영향 여부",
    "filter": { "kind": "select", "options": [
      { "value": true, "label": "영향 있음" },
      { "value": false, "label": "영향 없음" }
    ] }
  },
  "score": { "type": "number", "label": "점수", "filter": { "kind": "numberRange" } },
  "observedAt": { "type": "datetime", "label": "관측 시각", "filter": { "kind": "dateRange" } }
}
```

`select`와 `multiSelect`는 string/number/boolean에서만 사용하며 필드 타입과 일치하는 고유한 옵션 1~100개를 지정한다. 옵션 label은 공백만으로 구성할 수 없다. `numberRange`는 number, `dateRange`는 datetime에서만 사용한다. 중첩 객체·배열 또는 목록 밖 필드 선언은 설정 오류다. 메뉴의 `list.query`에는 검색 가능 여부와 선언 순서의 필터 key/label/type/kind/options만 공개한다. 기존 `columns` 형식은 유지한다.

검색은 앞뒤 공백을 제거하고 ASCII 대소문자만 무시하는 리터럴 부분 문자열 비교다. `%`, `_`, 역슬래시와 내부 공백은 그대로 비교한다. 선택값 문자열은 대소문자와 공백을 구분한다. 날짜는 UTC 달력일이며 종료일 다음 날 00:00 미만까지 포함한다. 저장 datetime은 유효한 `YYYY-MM-DDTHH:mm:ss[.fraction](Z|±HH:mm)`로 비교하며 소수 초는 1~9자리, 연도는 0001~9999를 지원한다. 누락·null·잘못된 타입·유효하지 않은 날짜는 활성 조건에 일치하지 않는다.

저장 스키마 migration은 필요하지 않다. 서버·웹·플러그인 선언을 함께 배포하며 이전 서버로 롤백할 때는 새 선언도 제거한다. 이전 서버가 v2 cursor를 해석하지 못하면 첫 묶음부터 다시 조회한다. 이 기능 추가만으로 0.1.0 기술 프리뷰의 지원 범위를 변경하지 않는다.


자산관리 예시도 검색·필터를 선언한다. 서버 자산은 호스트명·환경·IP를 검색하고 환경(현재 원천 fixture의 `sandbox`)과 활성 상태로 필터링한다. 저장소는 전체 이름·피드를 검색하고 활성 상태와 피드로 필터링한다. 피드는 원천 boolean을 transform에서 문자열로 저장하므로 옵션도 문자열 `"true"`/`"false"`를 사용한다. 환경의 정적 옵션은 원천 환경 종류가 늘면 플러그인 선언에 추가한다.

## 목록 정렬 선언

기본 목록에 포함된 최상위 scalar 필드는 `"sortable": true`로 정렬을 허용할 수 있다. string, number, boolean, datetime만 지원하며 생략한 필드는 정렬 뱃지와 API 허용 목록에 포함되지 않는다. object·array, 중첩 필드와 목록 밖 필드는 정렬 가능으로 선언할 수 없다.

검증된 메뉴에는 정렬 필드의 `key`, `label`, `type`만 `list.sorts` 선언 순서로 전달된다. 예를 들어 `"score": { "type": "number", "label": "점수", "sortable": true }`는 점수 정렬을 허용한다. 여러 플러그인이 서로 다른 필드를 선언할 수 있으며 플랫폼 코어에 필드명을 추가할 필요가 없다.

## 읽기 전용 설정 상세

웹 홈에서 플러그인 이름을 선택하면 `/plugins/<plugin-id>` 설정 상세 화면으로 이동한다. 이 화면과 `GET /api/v1/plugins/<plugin-id>` API는 서버가 현재 검증해 로드한 다음 공개 구성만 표시한다.

- 플러그인 이름·ID·버전·설명·활성화 여부
- source 종류별 연결 대상, 요청 또는 로컬 파일명, pagination·batch·실행 한도
- 데이터 타입·중첩 필드·유일키·관계
- 메뉴와 목록 컬럼·검색·필터·정렬, 상세 섹션
- 등록 transform 코드와 표시한 파일 종류

Connection의 인증 사용자·비밀번호·secret 참조와 서버의 설정 루트·절대 파일 경로는 공개하지 않는다. HTTP 연결 대상은 userinfo·query·fragment를 제거하고 로컬 source는 basename만 표시한다. 설정 상세 조회는 수집, 저장, 파일 또는 registry 변경을 실행하지 않는다.

플러그인 개발 트리에서는 등록된 `<plugin>/dist/<name>.js`에 대응하는 `<plugin>/<name>.ts`가 일반 파일로 존재하면 TypeScript 원본을 우선 표시한다. 배포 환경처럼 원본이 없으면 실제 등록된 JavaScript를 표시한다. 두 파일 모두 등록된 플러그인 디렉터리 안에서만 읽으며, 안전하게 읽을 수 없거나 크기 제한을 넘으면 다른 구성은 유지하고 코드 영역만 조회 불가로 표시한다. 원본을 다른 이름이나 위치에 두었을 때 임의 탐색하지 않는다.
