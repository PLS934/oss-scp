## Why

sample2 mock API의 전체 반환 JSON을 sample1과 같은 플러그인·source·Connection 구조로 등록하려면, 현재 offset만 허용하는 source 계약을 single 방식까지 최소 확장해야 한다. 이 계약을 먼저 확정하면 후속 HTTP 수집기가 API별 경로·응답 구조·건수를 코어에 고정하지 않고 두 샘플을 동일한 로더 출력으로 사용할 수 있다.

## What Changes

- sample1과 동일한 파일 구조를 사용하는 sample2 샘플 플러그인을 추가하고 기존 플러그인 등록 목록에 독립 항목으로 등록한다.
- sample1과 sample2가 서로 다른 API 연결임을 검증할 수 있도록 `mock-api-sample1`·`mock-api-sample2` HTTP Connection과 별도 mock 포트 `3001`·`3002`를 사용한다.
- 공통 `source.json` 스키마에 한 번 요청하고 종료하는 `single` pagination 변형을 추가한다.
- 기존 로컬 CSV source를 보존하면서 설정 로더와 내부 수집 정의가 file, offset 및 single을 구분해 해석하도록 확장한다.
- sample2의 독립 mock API Connection 참조, `/sample2`, GET, JSON 목록 경로를 설정에서 얻고 경로·응답 구조·153건을 코어에 고정하지 않는다.
- sample2 응답의 중첩 객체·배열과 최상위 `test_field6`을 후속 가공 단계가 원천 응답에서 접근할 수 있다는 경계를 문서화한다.
- 정상·오류·범용 single 설정 검증을 자동화하고 sample2 작성·검증 방법을 개발자 문서와 CI 경로에 반영한다.
- 실제 HTTP 호출, 응답 스트리밍·크기 제한, timeout·취소, 가공, DB 저장, checkpoint, 메뉴와 화면은 변경하지 않는다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `plugin-source-contract`: 기존 JSON offset source 계약에 JSON single source 선언, 검증 및 내부 수집 정의 해석을 추가한다.

## Impact

- `plugins/registry.json`, `connections/registry.json`, 새 sample2 플러그인과 전용 Connection 설정 파일이 변경된다.
- `packages/plugin-config`의 source JSON Schema, 공개 TypeScript 타입, 로더와 검증 테스트가 변경된다.
- `docs/plugin-development.md`와 기존 CI에서 실행하는 플러그인 설정 검증 범위가 sample2까지 확장된다.
- sample1의 offset 동작과 기존 로컬 CSV 동작은 그대로 유지하되 source의 Connection 참조를 기존 `mock-api`에서 대칭적인 `mock-api-sample1`로 이름 변경한다. 설정 검증은 네트워크를 호출하지 않으며, 직접 검증 시 같은 mock 서버 프로그램을 3001·3002의 독립 프로세스로 실행한다.
