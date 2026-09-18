## Why

현재 사용자 정의 React 목록·상세는 플랫폼 웹 이미지에 정적으로 포함되므로, 플러그인 화면을 추가하거나 교체할 때마다 플랫폼 이미지를 다시 빌드해야 한다. 외부 플러그인의 설정·transform과 같은 운영 흐름으로 사용자 정의 UI도 배포하면서 기존 기본 화면과 서버 권한 경계를 유지할 수 있는 공통 계약이 필요하다.

## What Changes

- 선택적 React 원본 진입점, 공통 빌드 명령, 배포용 ESM 번들과 UI manifest 계약을 정의한다.
- UI가 있는 플러그인도 서버 설정·transform과 하나의 플러그인 revision으로 빌드·검증·배포·롤백하도록 정의한다.
- 플랫폼이 제공하는 최소 UI 공개 API와 React·UI 계약 버전 호환성 정책을 정의한다.
- 기동 전 경로·호환성·무결성 검증, same-origin 정적 제공, 런타임 로딩, 오류·CSS 격리와 content hash 캐시 규칙을 정의한다.
- 선언형 기본 목록·상세만 사용하는 기존 플러그인의 제작·설치 흐름은 변경하지 않는다.
- 별도 생성기를 만들지 않고 #109의 설치형 플러그인 스킬과 독립 CLI를 후속 작업에서 확장하는 방향으로 후속 구현 경계를 나눈다.
- 제외 범위: 이 변경에서 빌드 CLI, UI 공개 API 패키지, 서버 로더 또는 웹 런타임 로더를 구현하지 않는다. 운영 중 TypeScript 변환·의존성 설치, 원격 UI 다운로드, 웹 UI를 통한 플러그인 설치와 비신뢰 코드 sandbox도 포함하지 않는다.

## Capabilities

### New Capabilities

- `plugin-ui-distribution`: 선택적 사용자 정의 UI의 원본·빌드·manifest·호환성·무결성·제공·캐시·롤백 계약을 규정한다.

### Modified Capabilities

- `custom-plugin-views`: 정적 웹 빌드 registry 전용 계약을 검증된 외부 UI 번들 또는 기존 공통 화면 선택 계약으로 변경한다.
- `plugin-menu-routing`: 활성 메뉴가 검증 완료된 UI descriptor를 통해 사용자 정의 화면을 비동기로 선택하도록 변경한다.
- `server-plugin-deployment`: 외부 UI 번들 금지를 사전 빌드·기동 전 검증·읽기 전용 주입을 전제로 한 선택적 UI 배포 허용으로 변경한다.

## Impact

후속 구현은 플러그인 설정 schema와 검증기, #109 플러그인 제작 스킬·CLI, 신규 UI 공개 API 패키지, API의 검증 완료 UI descriptor 및 정적 파일 제공, `apps/web`의 화면 registry·로더·오류 경계와 배포 Nginx/CSP 설정에 영향을 준다. 기존 저장·조회 API와 권한 검사는 유지하며 DB migration은 필요하지 않다.
