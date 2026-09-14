## Why

현재 모든 플러그인 메뉴는 선언형 정의를 공통 목록·상세 화면으로만 렌더링한다. 공통 표와 필드 나열로 표현하기 어려운 업무 화면을 지원하려면, 플랫폼과 함께 검토·빌드되는 React 화면을 플러그인별로 선택해 사용할 수 있어야 한다.

## What Changes

- 웹 빌드에 포함되는 정적 사용자 정의 화면 registry를 추가하고 플러그인 ID별 목록·상세 React 컴포넌트를 선택적으로 등록한다.
- 등록된 사용자 정의 화면에는 검증된 메뉴 context를 전달하고, 상세 화면에는 URL에서 해석한 record ID도 전달한다.
- 사용자 정의 화면이 없는 목록 또는 상세 route는 기존 공통 `RecordList`·`RecordDetail`을 그대로 사용한다.
- 사용자 정의 화면의 렌더링 오류를 해당 route 영역에서 처리하여 다른 메뉴와 애플리케이션 shell을 계속 사용할 수 있게 한다.
- 샘플 사용자 정의 화면과 등록·fallback·직접 URL·오류 격리 테스트 및 플러그인 개발 문서를 추가한다.
- 외부 UI 번들의 런타임 로딩, 독립 빌드·배포, 플러그인별 의존성 설치와 SDK 버전·무결성·캐시 계약은 제외하고 #94의 후속 범위로 유지한다.

## Capabilities

### New Capabilities

- `custom-plugin-views`: 플랫폼 웹 빌드에 정적으로 등록된 플러그인별 사용자 정의 목록·상세 화면의 선택, 입력, fallback과 오류 격리 계약을 규정한다.

### Modified Capabilities

- `plugin-menu-routing`: 등록된 메뉴 route가 사용자 정의 화면 registry를 확인하고 화면별 사용자 정의 컴포넌트 또는 기존 공통 화면을 결정하도록 변경한다.

## Impact

`apps/web`의 route 구성, 화면 컴포넌트 타입·registry와 오류 처리, 샘플 화면 및 웹 테스트가 영향을 받는다. `docs/plugin-development.md`에 플랫폼과 함께 빌드하는 사용자 정의 화면 등록 방법을 추가한다. 서버 API, 외부 플러그인 JSON schema, 저장·조회·권한 계약과 배포 중 외부 코드 로딩 정책은 변경하지 않는다.
