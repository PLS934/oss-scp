## Why

현재 플러그인 계약과 수집 실행기는 원천 레코드를 전달하지만, 플러그인별 가공 코드를 실행하고 선언된 데이터 구조로 검증하는 공통 경계가 없다. PostgreSQL 적재 작업 #29에 앞서 모든 입력이 동일한 가공·검증 경로를 통과하고 잘못된 레코드만 격리될 수 있도록 이 계약을 확정해야 한다.

## What Changes

- `plugin.json`에 빌드된 가공 모듈의 상대 경로와 데이터 종류·필드·유일키·관계 정의를 추가한다.
- 등록·검증된 JavaScript 모듈을 Node.js 동적 import로 한 번 로딩하고 이름이 고정된 `transform` 함수를 확인한다.
- 원천 레코드 한 건마다 동기 또는 비동기 `transform`을 호출하는 DB·NestJS·수집 방식 비종속 공개 타입을 제공한다.
- 한 원천 레코드가 여러 정규화 레코드와 관계를 반환할 수 있게 하고, 반환 구조·필드 타입·유일키·관계·크기 제한을 공통 검증한다.
- 실패한 원천 레코드의 출력 전체만 격리하고 정상 레코드는 계속 처리하며 결과를 `partial`로 보고한다.
- 검증된 결과를 제한된 묶음으로 저장 소비자에게 전달하고 소비 완료를 기다려 전체 결과를 메모리에 누적하지 않는다.
- sample1·sample2와 CSV 샘플 플러그인에 데이터 정의와 TypeScript 가공 예제를 추가한다. sample2는 중첩 객체·배열과 source 계약이 허용한 최상위 응답 메타데이터 접근을, CSV는 문자열 원천 값의 숫자·날짜·불리언 변환을 검증한다.
- 세 입력 형식이 동일한 가공 엔진을 사용하고 sample별 필드·건수를 코어에 고정하지 않는 설정·모듈·가공·검증·격리·흐름 테스트와 작성 문서를 제공한다.
- 실제 DB 저장, migration, upsert, checkpoint 영속화, #35의 single HTTP 수집 실행, #24의 HTTP CSV 다운로드 실행, 비신뢰 코드 샌드박스와 화면은 변경하지 않는다.

## Capabilities

### New Capabilities

- `plugin-transform-runtime`: 플러그인 가공 모듈 로딩, 레코드 단위 실행, 결과 검증·격리와 저장 입력 전달 계약을 정의한다.

### Modified Capabilities

- `plugin-source-contract`: 최소 플러그인 선언에 가공 모듈과 데이터 정의를 추가하고 배포 전 파일·필드·유일키·관계 참조 검증을 확장한다.

## Impact

- `packages/plugin-config`의 plugin JSON Schema, 공개 타입, 로더와 검증 테스트가 변경된다.
- 공개 가공 타입과 실행·검증 로직을 제공하는 새 workspace 패키지 또는 수집 코어 모듈이 추가된다.
- `plugins/sample1-offset-api`, `plugins/sample2-single-api`와 CSV 샘플 플러그인에 데이터 정의와 가공 코드가 추가되고 빌드 경로에 포함된다. 아직 HTTP 실행기가 없는 source는 fixture 또는 로컬 입력으로 가공 경로를 검증한다.
- 플러그인 개발 문서와 CI 검증 범위가 가공 코드 작성·빌드·실행까지 확장된다.
- 런타임은 Node.js 동적 import를 사용하며 새 외부 서비스나 DB 연결을 요구하지 않는다.
