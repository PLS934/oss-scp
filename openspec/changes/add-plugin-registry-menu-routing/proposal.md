## Why

배포된 플러그인이 선언한 데이터 범위로 사용자가 진입하려면 현재의 고정 상태 화면을 플러그인 registry 기반 메뉴와 URL 라우팅으로 확장해야 한다. 목록·상세 renderer를 추가하기 전에 메뉴 선택, 직접 URL 접근, 새로고침이 동일한 플러그인 조회 범위를 복원하는 공통 클라이언트 경계가 필요하다.

## What Changes

- 플러그인 manifest에 메뉴 제목, 아이콘, 그룹, 순서, 경로와 대상 데이터 종류를 선언하는 계약을 추가한다.
- 등록된 플러그인과 source 정의를 결합해 클라이언트가 소비할 검증된 메뉴 registry 산출물을 만든다.
- 메뉴 경로를 `pluginId`, `sourceId`, `dataType` route context로 해석하고 메뉴 선택·직접 URL·새로고침에서 같은 결과를 제공한다.
- 플러그인 등록 순서와 독립된 결정적 메뉴 정렬 규칙을 적용한다.
- 중복 경로, 지원하지 않는 아이콘, 존재하지 않는 데이터 종류 참조를 배포 전 검증 오류로 거부한다.
- 알 수 없는 경로와 등록 해제된 플러그인의 과거 경로를 안전한 not-found 상태로 처리한다.
- 실제 레코드 영역은 후속 선언형 목록·상세 renderer가 route context를 사용할 수 있는 placeholder로 제공한다.
- sample1과 경로·표시명이 다른 플러그인이 코어 수정 없이 메뉴에 추가되는 테스트와 registry 원본 경계 문서를 추가한다.
- 운영 중 동적 설치, 웹 메뉴 편집, 사용자 정의 React 화면, 목록·상세 필드 렌더링, 권한 구현은 제외한다.

## Capabilities

### New Capabilities

- `plugin-menu-routing`: 검증된 플러그인 registry에서 공통 메뉴를 생성하고 URL을 플러그인 조회 범위로 복원하는 계약

### Modified Capabilities

- `plugin-source-contract`: 플러그인 manifest 메뉴 선언과 데이터 종류 참조 및 registry 전체의 경로 유일성 검증 계약

## Impact

- `packages/plugin-config`: manifest 타입·JSON Schema·교차 플러그인 검증과 클라이언트용 메뉴 registry 생성 계약이 변경된다.
- `plugins/*/plugin.json`: 등록된 샘플 플러그인에 메뉴 선언이 추가된다.
- `apps/web`: 메뉴 UI, URL 라우팅, route context placeholder, not-found 상태와 관련 테스트가 추가된다.
- 웹 앱에 클라이언트 라우팅 의존성이 추가될 수 있으며 정적 Nginx의 직접 경로 fallback 설정을 검증한다.
- 공개 조회 API의 요청·응답 계약과 저장 모델은 변경하지 않는다.
