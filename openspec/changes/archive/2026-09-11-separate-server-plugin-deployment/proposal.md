## Why

현재 배포 이미지는 운영자 플러그인·Connection·fixture를 이미지 안에 복사하므로 플랫폼 버전을 올리거나 플러그인 revision만 바꿀 때마다 API 이미지를 다시 빌드해야 한다. #52에서 registry 기반 메뉴·라우팅 경계가 마련되었으므로, 서버 플러그인 배포를 플랫폼 이미지에서 분리해 두 revision을 독립적으로 검증·교체·롤백할 수 있게 한다.

## What Changes

- 운영자가 관리하는 외부 설정 루트에서 plugin·Connection registry와 사전 빌드된 JavaScript 가공 모듈을 로드한다.
- 명시적인 설정 루트 입력을 API 기동, 수동 수집 CLI와 검증 CLI가 동일하게 사용하고 저장소 탐색에 의존하지 않게 한다.
- 설정 루트·플러그인 디렉터리 밖으로 나가는 경로, 심볼릭 링크 이탈, 누락 파일, 중복 ID·메뉴 경로, 선언과 코드 불일치 및 지원하지 않는 API/schema 버전을 외부 연결이나 DB 접근 전에 거부한다.
- API는 기동 전에 전체 외부 설정을 검증하고, 검증된 메뉴 산출물을 클라이언트에 제공한다. 잘못된 플러그인이 하나라도 있으면 비밀정보 없는 오류로 기동을 중단한다.
- 배포 API 이미지에서 저장소의 플러그인·Connection·fixture를 제거하고 Compose 외부 PostgreSQL 설치가 운영자 설정 디렉터리를 읽기 전용 볼륨으로 주입하게 한다.
- 플랫폼 이미지 태그 또는 digest와 플러그인 Git revision의 호환 조합, 배포 전 검증, 교체 및 롤백 절차를 문서화한다.
- **BREAKING**: 배포 이미지의 수동 수집과 API 기동은 이미지 내부 `/app/plugins`·`/app/connections` 대신 명시적으로 주입된 외부 설정 루트를 요구한다.
- TypeScript 런타임 변환, 플러그인별 임의 패키지 설치, 원격 코드 다운로드, 운영 중 동적 설치·수정은 제공하지 않는다.
- `List.tsx`·`Detail.tsx` 같은 사용자 정의 React 화면의 외부 로딩은 제외하고 기존 플랫폼 빌드 결합을 유지한다.

## Capabilities

### New Capabilities

- `server-plugin-deployment`: 외부 서버 플러그인 설정 루트, 기동 전 검증, 읽기 전용 배포 주입과 플랫폼/플러그인 revision 독립 운영 계약을 정의한다.

### Modified Capabilities

- `plugin-source-contract`: repository 고정 루트 대신 명시적 외부 설정 루트를 검증하며 실제 경로가 그 루트를 벗어나지 않도록 계약을 강화한다.
- `manual-collection-cli`: 수동 수집 CLI가 명시적으로 주입된 외부 설정 루트를 사용하도록 배포 실행 계약을 변경한다.
- `plugin-menu-routing`: 빌드에 포함된 registry 대신 서버가 기동 시 검증한 외부 registry의 메뉴 산출물을 클라이언트가 사용하도록 변경한다.

## Impact

- `packages/plugin-config`: 설정 루트 입력, 실경로 경계, 호환성 및 모듈 검증
- `apps/api`: 기동 전 registry 검증과 클라이언트 메뉴 제공
- `apps/collector-cli`: 외부 설정 루트 선택과 검증된 정의 사용
- `apps/web`: 빌드 시 정적 메뉴 대신 API가 제공하는 검증된 메뉴 로딩
- `apps/api/Dockerfile`, Compose 파일과 Docker 검증 스크립트: 내장 플러그인 제거 및 읽기 전용 볼륨 주입
- 플러그인 작성·설치·배포·롤백 문서와 통합 개발 플랜
- 신규 런타임 패키지 설치는 없으며 기존 Node.js ESM과 JSON Schema 검증 경계를 재사용한다.
