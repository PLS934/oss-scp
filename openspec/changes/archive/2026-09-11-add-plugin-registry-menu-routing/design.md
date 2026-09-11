## Context

제안 배경은 [proposal.md](./proposal.md)를 따른다. 현재 `plugin-config`는 등록된 `plugin.json`, `source.json`, Connection을 읽어 수집용 `CollectionDefinition[]`을 반환하고, 웹 앱은 고정된 서버 상태 화면만 렌더링한다. 저장 레코드 클라이언트 API는 이미 `pluginId`, `sourceId`, `dataType` 범위를 받지만 이를 생성하는 메뉴·URL 경계는 없다. 배포 Nginx는 `/api`를 별도 프록시하지만 그 외 알 수 없는 정적 경로를 404로 처리한다.

## Goals / Non-Goals

**Goals:**

- 수집 정의 검증 결과에서 비밀정보가 없는 클라이언트 메뉴 manifest를 결정적으로 생성한다.
- URL과 조회 범위의 일대일 대응을 작고 테스트 가능한 클라이언트 모듈로 둔다.
- 향후 목록·상세 renderer가 route context만 소비하도록 경계를 고정한다.
- 개발 서버와 배포 Nginx에서 직접 경로 및 새로고침을 같은 방식으로 지원한다.

**Non-Goals:**

- 웹 런타임에서 Git 설정을 수정하거나 플러그인을 동적으로 설치하지 않는다.
- 레코드 목록·상세 필드 렌더링, 사용자 정의 React 화면과 권한 검사를 구현하지 않는다.
- 한 플러그인에서 여러 메뉴를 선언하거나 메뉴 그룹의 별도 표시 순서를 추가하지 않는다.

## Decisions

### 검증 결과에서 전용 메뉴 manifest를 생성한다

`plugin-config`의 성공 결과에 수집 정의와 별도로 직렬화 가능한 메뉴 항목을 제공한다. 항목은 표시 정보와 `pluginId`, source 설정에서 해석한 `sourceId`, `dataType`만 포함하며 Connection base URL, 파일 시스템 경로와 transform 경로는 포함하지 않는다. 빌드 전 생성 스크립트가 이 결과를 웹 앱 내부의 생성 파일로 기록하고 Vite는 그 파일만 번들링한다.

대안으로 웹 앱이 `plugins/registry.json`과 각 manifest를 직접 import할 수 있지만 검증 로직이 브라우저 번들에 중복되고 비밀 제외 경계가 흐려진다. 서버 런타임 API로 메뉴를 제공하는 방식은 동적 설치가 범위가 아닌 현재 단계에 불필요한 운영 의존성을 만든다.

### 플러그인에는 메뉴 대상 dataType만 선언하고 sourceId는 해석한다

각 플러그인은 현재 하나의 source만 가지므로 메뉴가 `dataType`을 선언하고 `pluginId`는 manifest ID, `sourceId`는 결합된 source 정의에서 얻는다. HTTP source는 Connection ID를, 로컬 파일 source는 현재 수집 실행과 같은 source 식별 규칙을 사용한다. 이렇게 하면 화면과 수집 저장 범위가 서로 다른 식별자를 별도로 작성해 어긋나는 것을 막는다.

메뉴에 세 식별자를 모두 중복 선언하는 대안은 설정만 보면 명시적이지만, 기존 source나 plugin ID 변경 시 불일치 검증과 migration 부담이 생긴다.

### 메뉴 계약을 좁고 결정적으로 유지한다

`menu`는 `title`, `icon`, `group`, 정수 `order`, `/`로 시작하는 정규화된 절대 `path`, `dataType`을 필수로 가진다. 아이콘은 웹 앱이 제공하는 고정 열거형으로 제한하며 초기 샘플에 필요한 `server`, `shield`, `repository`만 지원한다. 표시 순서는 Unicode 코드 포인트 기준 그룹 이름, 숫자 order, 제목, 경로 순이다. 동일 경로는 registry 전체 검증 오류로 처리한다.

임의 아이콘 문자열이나 URL을 허용하면 누락 리소스와 외부 로딩 정책이 필요하고, registry 순서를 표시 순서로 재사용하면 운영자가 독립적인 등록·표시 의도를 표현할 수 없다.

### URL 라우팅은 React Router의 browser history를 사용한다

웹 앱은 `react-router-dom`의 browser router로 생성 manifest의 각 절대 경로를 등록한다. 공통 레이아웃이 그룹 메뉴와 서버 연결 상태를 유지하고, 등록 경로의 element는 route context placeholder를 렌더링한다. catch-all route는 not-found 상태만 제공한다. 라우팅 구성은 manifest를 입력받는 순수 변환과 UI 렌더링을 분리해 단위 테스트할 수 있게 한다.

History API를 직접 감싸는 대안은 현재 경로만 처리하기에는 작지만 향후 상세 하위 경로, 링크 상태와 테스트 도구를 다시 구현해야 한다. hash routing은 서버 fallback이 불필요하지만 공개 URL 계약이 fragment에 종속되어 선택하지 않는다.

### 정적 서버 fallback은 API와 분리한다

Nginx의 `/` location은 실제 정적 파일이 없으면 `/index.html`로 fallback한다. 기존 `/api` location은 우선 매칭되어 API 404가 SPA HTML로 바뀌지 않는다. Vite 개발 서버의 history fallback과 함께 직접 URL·새로고침 브라우저 테스트를 수행한다.

## Risks / Trade-offs

- [생성 manifest가 오래될 수 있음] → 웹 build 전에 생성 스크립트를 필수 실행하고 변경 후 생성 파일 차이를 CI에서 검증한다.
- [로컬 파일 sourceId에 파일 경로가 노출될 수 있음] → 현재 저장 범위 식별과 동일한 저장소 상대 식별자만 manifest에 포함하고 절대 경로는 금지한다. sourceId 계약을 후속 변경에서 바꾸면 수집과 메뉴를 함께 migration한다.
- [고정 아이콘 목록이 플러그인 표현을 제한함] → 알 수 없는 아이콘을 조용히 대체하지 않고 계약 버전 변경으로 허용 목록을 명시적으로 확장한다.
- [SPA fallback이 정적 오타를 숨길 수 있음] → `/api`는 별도 location으로 유지하고 클라이언트 catch-all이 사용자에게 명시적인 not-found를 표시한다.

## Migration Plan

1. 기존 세 샘플 플러그인에 서로 다른 유효 메뉴 선언을 추가하여 새 필수 계약으로 한 번에 전환한다.
2. 메뉴 manifest 생성과 검증을 CI에 추가한 뒤 웹 앱 라우팅과 Nginx fallback을 배포한다.
3. 롤백 시 웹 앱·plugin-config·샘플 manifest 변경을 같은 revision으로 되돌린다. 저장 DB와 조회 API migration은 없다.
