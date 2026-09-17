## Context

현재 서버 플러그인은 외부 설정 루트의 `plugin.json`, `source.json`, 사전 빌드 `dist/transform.js`를 registry에 등록하고 API 기동 전에 전체 검증한다. 사용자 정의 목록·상세만 `apps/web/src/custom-plugin-views.tsx`와 개별 TSX 파일에 정적으로 등록되어 웹 이미지에 함께 빌드된다. 자세한 동기는 `proposal.md`의 Why를 따른다.

#106에서 `CustomPluginViewSet`의 `List`·`Detail`, 검증된 `menu`와 `recordId` 입력, route 오류 경계와 미등록 화면 fallback이 마련되었다. 이번 설계는 이 선택 경계를 외부 번들까지 확장하되, 운영자가 완성된 플러그인 디렉터리를 등록·검증·재기동하는 기존 설치 흐름을 유지한다.

플러그인 UI는 운영자가 검토하고 Git revision으로 고정한 신뢰 코드다. 같은 브라우저 realm에서 실행하므로 보안 sandbox는 제공하지 않으며, 데이터 권한은 기존 same-origin API가 계속 강제한다.

## Goals / Non-Goals

**Goals:**

- UI가 없는 기존 플러그인은 추가 제작·설치 단계 없이 계속 동작한다.
- 서버 설정·transform·선택적 UI를 하나의 플러그인 revision으로 빌드·검증·배포·롤백한다.
- UI 제작자는 고정된 진입점과 최소 공개 API만 배우고 공통 명령 한 번으로 운영 배포물을 만든다.
- 플랫폼 이미지와 호환되는 플러그인 revision을 독립적으로 교체한다.
- 호환성, 무결성, 경로, 캐시와 오류 격리를 기동 전·런타임 경계에서 검증 가능하게 만든다.
- 구현을 UI 공개 API, #109 제작 도구 확장, 서버 제공, 웹 로더와 통합 검증의 독립 후속 이슈로 나눌 수 있게 한다.

**Non-Goals:**

- 운영 중 TS/TSX 변환, 패키지 설치 또는 원격 코드 다운로드
- 비신뢰 플러그인 sandbox, iframe 또는 프로세스 격리
- 웹 UI를 통한 플러그인 설치·수정·hot reload
- React Router, 플랫폼 shell 컴포넌트 또는 내부 상태를 공개 API로 제공
- UI 전용 registry·revision 또는 서버 플러그인과 분리된 배포 절차
- #109와 별개의 플러그인 생성 도구

## Decisions

### 1. 소스와 운영 배포물을 구분한다

제작 저장소는 다음 규약을 사용한다.

```text
my-plugin/
├── plugin.json
├── source.json
├── transform.ts              # 제작 방식에 따라 JS도 허용
├── ui/                       # 선택
│   ├── List.tsx              # 선택
│   ├── Detail.tsx            # 선택
│   └── style.css             # 선택
├── package.json
└── dist/                     # 생성물
```

#109의 설치형 스킬과 독립 CLI를 후속 확장해 생성한 프로젝트에서 공통 `build` 명령을 실행한다. 명령은 transform과 UI를 빌드하고 설정·export·스타일·호환성을 검사한 다음 실행 준비가 끝난 운영 디렉터리를 만든다. 사용자가 transform과 UI에 서로 다른 build/validate/pack 명령을 순서대로 실행하게 하지 않는다.

운영 배포물은 다음처럼 소스와 개발 의존성을 제외한다.

```text
plugin/
├── plugin.json
├── source.json
└── dist/
    ├── transform.js
    └── ui/                   # 선택
        ├── manifest.json
        ├── index.<sha256>.js
        └── style.<sha256>.css
```

대안으로 UI만 별도 artifact와 registry로 배포하는 방식을 검토했으나 서버 선언·화면이 다른 revision으로 섞이고 운영 단계가 늘어나므로 선택하지 않는다.

### 2. 목록·상세 named export를 가진 단일 ESM 번들을 사용한다

UI 진입점은 기존 `CustomPluginViewSet`과 대응하는 `List`·`Detail` named export를 생성한다. 둘 중 하나는 생략할 수 있다. ESM은 브라우저 표준 동적 import와 content hash URL을 사용할 수 있어 별도 Module Federation runtime이 필요 없다.

Module Federation은 공유 의존성 협상 기능이 있지만 빌드 도구와 runtime 결합이 크다. React까지 각 플러그인에 포함하는 self-contained 번들은 React 중복과 hook/runtime 충돌을 만들 수 있어 제외한다.

React와 `react/jsx-runtime`은 플랫폼이 고정한 same-origin 공유 module로 제공하고 플랫폼 웹과 플러그인 UI 모두 같은 instance를 사용한다. 플랫폼 시작 문서의 정적 import map이 공유 React와 `@oss-scp/plugin-ui` major를 해석하며, 플러그인 빌드는 이를 external로 남긴다. import map은 플랫폼 릴리스에 포함되며 플러그인 설치 때 동적으로 수정하지 않는다.

### 3. UI manifest가 유일한 런타임 등록 계약이다

`plugin.json`은 선택적인 UI manifest 상대 경로만 참조한다. UI manifest v1의 논리 형식은 다음과 같다.

```json
{
  "apiVersion": "oss-scp/plugin-ui-v1",
  "pluginId": "sample2-single-api",
  "uiRevision": "0.2.0",
  "sdkContract": 1,
  "react": ">=19.2.0 <20",
  "screens": {
    "list": "List",
    "detail": "Detail"
  },
  "entry": {
    "path": "./index.8f2c....js",
    "sha256": "8f2c..."
  },
  "style": {
    "path": "./style.61ab....css",
    "sha256": "61ab..."
  }
}
```

`style`과 각 screen은 선택이다. `pluginId`는 부모 `plugin.json`과 같아야 한다. `uiRevision`은 진단과 호환성 기록에 쓰지만 독립 배포 선택자는 아니며, 실제 캐시 identity는 SHA-256이다. manifest와 모든 파일은 같은 플러그인 디렉터리 안의 일반 파일이어야 한다.

기동 전 검증은 JSON schema, ID 일치, 지원 계약 major와 React 범위, 상대 경로 정규화·symlink 이탈, 파일 존재·크기·content type, SHA-256과 선언 export를 확인한다. UI만 제외한 부분 기동은 허용하지 않는다. 이 원자성은 서버 선언과 전용 화면이 어긋난 상태를 막는다.

### 4. UI 공개 API는 현재 내부 조회 경계의 최소 부분만 승격한다

신규 `@oss-scp/plugin-ui` 계약 major 1은 다음만 제공한다.

- 기존 `CustomPluginListProps`와 `CustomPluginDetailProps`에 대응하는 공개 입력 타입
- 검증된 메뉴 context를 사용하는 목록 조회와 단건 조회
- 플랫폼이 생성해 props로 전달하는 상세·목록 href 또는 navigation callback
- 취소 가능한 요청과 일반화한 공개 오류 타입

Connection, secret, source 원문, NestJS/DB 객체, 플랫폼 전역 상태와 React Router hook은 제공하지 않는다. 플러그인 UI가 라우터에 직접 의존하지 않게 하여 내부 라우터 업그레이드가 UI 계약 변경이 되지 않게 한다.

`sdkContract`는 정수 major다. 같은 major에서는 선택 필드·함수 추가만 허용하고 기존 의미, 필수 입력 또는 export를 바꾸지 않는다. 플랫폼은 지원 major와 React 범위를 릴리스 메타데이터·검증 명령에서 공개한다. 플랫폼 업그레이드 전 대상 이미지 검증기가 전체 플러그인 revision의 호환성을 검사한다.

### 5. API가 검증 완료 descriptor와 UI 파일만 제공한다

기존 메뉴 응답은 화면별 선택적 UI descriptor를 포함한다. descriptor에는 plugin ID, UI revision, 화면 종류와 content-hash same-origin URL만 포함하며 설정 루트 경로나 원본 manifest 경로는 포함하지 않는다.

UI 파일은 예를 들어 `/api/v1/plugin-ui/<plugin-id>/<ui-revision>/<sha256>/<file>` 아래에서 제공한다. API가 기동 시 만든 immutable snapshot과 일치하는 요청만 허용하며 요청 경로를 파일 시스템 경로로 직접 해석하지 않는다. content hash가 있는 파일은 `immutable` 캐시를 사용하고, 메뉴/descriptor 응답과 HTML 시작 문서는 재검증 가능한 정책을 사용한다.

Nginx는 `/api` same-origin proxy를 유지하므로 별도 공유 volume이나 UI 전용 web image가 필요 없다. CSP는 self script/style/connect만 허용하고 remote module, inline script와 임의 style source를 허용하지 않는다.

### 6. 웹 로더는 기존 화면 선택·오류 경계를 비동기로 확장한다

메뉴 route는 다음 순서로 화면을 선택한다.

1. 현재 화면 종류에 UI descriptor가 없으면 즉시 공통 화면을 사용한다.
2. descriptor가 있으면 content-hash URL의 CSS를 route 전용 root에 연결하고 ESM을 동적 import한다.
3. 선언 export를 React component로 확인한 뒤 기존 `menu`·`recordId` 입력으로 렌더링한다.
4. download/import/export/render 실패는 현재 route의 오류 경계에서 일반화해 표시한다.
5. route key가 바뀌면 오류·loader 상태를 초기화하고 다른 플러그인을 정상 로드한다.

descriptor가 있는데 로드에 실패한 경우 공통 화면으로 자동 fallback하지 않는다. 전용 화면의 의미를 공통 화면이 대체한다는 보장이 없고 배포 장애를 숨길 수 있기 때문이다. descriptor가 애초에 없는 화면만 공통 renderer를 사용한다.

### 7. CSS 격리는 빌드 규칙과 route root를 함께 사용한다

공통 빌드는 플러그인 CSS selector를 고유 route root 아래로 scope한다. `html`, `body`, `:root`, universal 전역 reset, `@import`와 외부 `url()`은 오류로 거부한다. CSS module 사용은 허용하되 런타임 계약으로 강제하지 않는다.

같은 realm 신뢰 코드이므로 이 격리는 실수에 의한 충돌을 줄일 뿐 악성 DOM·CSS 조작을 막는 보안 경계는 아니다. 강한 격리가 필요하면 iframe sandbox라는 별도 제품 계약이 필요하다.

### 8. 후속 구현은 독립 검증 가능한 다섯 단위로 나눈다

1. `@oss-scp/plugin-ui` 최소 공개 타입·조회 API와 호환성 메타데이터
2. #109 설치형 스킬·독립 CLI의 UI 템플릿·단일 build·manifest/hash/CSS 검증 확장
3. plugin config의 UI manifest 검증, descriptor와 immutable same-origin 파일 제공
4. 웹의 공유 React mapping, 비동기 UI loader, route 오류·스타일 lifecycle과 CSP
5. 샘플 플러그인 이전 및 제작→검증→배포→캐시→플랫폼 업그레이드→롤백 통합 검증

각 단위는 별도 이슈로 등록할 수 있으며, 1과 2의 계약을 먼저 고정한 뒤 3과 4를 병렬 구현하고 5로 결합한다.

## Risks / Trade-offs

- [같은 realm의 신뢰 UI가 플랫폼 DOM과 브라우저 API에 접근 가능] → 운영자 검토·revision 고정을 설치 전제로 명시하고 원격 의존성을 금지한다. 비신뢰 코드는 지원하지 않는다.
- [공유 React 설정이 플랫폼 웹 빌드도 변경] → import map과 실제 공유 module을 플랫폼 통합 테스트에서 함께 고정하고 hook을 사용하는 샘플 UI로 단일 instance를 검증한다.
- [엄격한 CSS 규칙이 일부 라이브러리를 막음] → v1은 전용 화면에 필요한 작은 스타일을 우선하고 전역 stylesheet가 필요한 UI framework는 지원 범위에서 제외한다.
- [플러그인 오류 하나가 전체 기동을 막음] → 서버 선언과 UI의 원자성을 우선한다. 운영자는 검증 CLI로 배포 전에 발견하고 이전 전체 revision으로 롤백한다.
- [API가 UI 파일을 제공하면 트래픽과 보안 책임이 늘어남] → 파일 크기 제한, immutable cache, snapshot 기반 allowlist, 명시 content type과 CSP로 범위를 제한한다.
- [SDK major 증가가 플러그인 재빌드를 요구] → additive 변경은 같은 major에 유지하고 대상 이미지 검증과 지원 종료 예고를 제공한다.

## Migration Plan

1. UI 공개 API와 플랫폼 호환성 메타데이터를 추가하되 기존 정적 registry를 유지한다.
2. #109 도구 확장과 서버 manifest 검증·정적 제공을 추가한다. 아직 웹에서 외부 UI를 선택하지 않는다.
3. 웹 로더를 추가하고 sample2 사용자 정의 화면을 외부 플러그인 UI로도 빌드해 정적 registry와 동등 동작을 검증한다.
4. 외부 UI 경로의 목록·상세·직접 URL·새로고침·오류·캐시·CSP 통합 검증 후 sample2 정적 registry 항목과 웹 내부 컴포넌트를 제거한다.
5. UI가 없는 모든 기존 플러그인과 선언형 화면 회귀 테스트를 통과시킨다.

롤백은 이전 플랫폼 image digest와 이전 플러그인 Git revision 조합으로 재기동한다. DB schema나 저장 레코드를 변경하지 않으므로 데이터 migration 역행은 없다. 외부 UI 로더 배포 중 문제가 생기면 외부 UI descriptor를 사용하지 않는 이전 플랫폼 이미지로 되돌리며 기존 선언형 플러그인은 계속 동작한다.
