## Why

최신 `main`은 외부 설정과 transform 모듈을 API listen 전에 검증하지만, 성공 결과 중 메뉴만 별도로 주입하고 전체 수집 정의를 공통 runtime 경계로 보존하지 않는다. 또한 실패 시 구조화된 설정 오류를 일반 메시지로 치환하므로 운영자가 문제 파일과 필드를 한 번에 진단할 수 없다.

## What Changes

- 기존 preflight 성공 결과의 수집 정의와 정렬된 메뉴를 API 프로세스 수명 동안 하나의 읽기 전용 runtime registry snapshot으로 제공한다.
- 메뉴 계층은 별도 메뉴 배열 대신 같은 runtime registry를 사용하고, 후속 플러그인 정의 소비자도 이 경계를 재사용할 수 있게 한다.
- 외부 설정 파일은 기동 시 한 번만 읽으며 실행 중 변경은 현재 snapshot에 반영하지 않고 재기동 후에만 검증·적용한다.
- preflight가 반환한 모든 설정 오류의 상대 파일·필드 경로·일반화한 원인을 안전하게 출력하고, 설정 루트 절대 경로·원본 예외·stack과 로그 제어문자는 노출하지 않는다.
- runtime registry와 재기동 적용 동작을 단위·API 프로세스 테스트 및 운영 문서로 검증한다.
- 현재 등록 계약이 없는 custom fetch, Plugin·Connection schema, Compose 주입, transform 실행과 DB·업무 API는 변경하지 않는다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `server-plugin-deployment`: 기동 시 검증된 설정을 같은 runtime snapshot으로 소비하고, 실행 중 파일 변경은 재기동 전까지 반영하지 않으며, 여러 설정 오류를 안전한 상세 정보로 보고하는 배포 동작을 명확히 한다.

## Impact

- `apps/api`: runtime registry interface와 provider, bootstrap 오류 형식, 메뉴 소비 경계 및 단위·프로세스 테스트가 변경된다.
- `packages/plugin-config`: 기존 `preflightConfiguration`의 성공·실패 결과를 그대로 재사용하며 공개 설정 형식은 바뀌지 않는다.
- `docs/server-development.md`: 기동 snapshot과 재기동 적용 정책을 보완한다.
- 환경변수, Plugin/source/Connection schema, transform loader·실행기, Compose, Docker 이미지, DB schema와 클라이언트 API 계약은 변경하지 않는다.
