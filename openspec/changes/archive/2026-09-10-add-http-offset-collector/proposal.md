## Why

#19가 검증한 JSON offset source 정의는 아직 실제 HTTP 요청을 실행하지 않으므로 sample1 원천 데이터를 수집 파이프라인의 묶음 처리 경계로 전달할 수 없다. #14의 재현 가능한 mock API를 대상으로 순차 처리, 크기 제한과 실패 전파를 먼저 검증해 후속 가공·저장·checkpoint 단계가 안전하게 연결될 기반을 만든다.

## What Changes

- 검증된 HTTP JSON offset 수집 정의로 `offset`·`limit` 요청을 순차 실행하고 각 원천 묶음을 변경 없이 처리 함수에 전달한다.
- `total`과 누적 건수를 함께 검증해 정상 완료를 판정하며, 조기 빈 목록·페이지 건수 불일치·수집 중 `total` 변경을 오류로 처리한다.
- timeout·외부 취소·HTTP 오류·JSON/응답 경로 오류·처리 함수 실패 시 이후 요청을 중단하고 원인을 구분해 전달한다.
- 응답 본문을 스트리밍으로 읽으면서 압축 해제 후 실제 바이트 한도를 적용하고, 단일 레코드 직렬화 바이트 한도를 별도로 검사한다.
- 처리 함수가 완료된 뒤에만 다음 페이지를 요청해 동시 요청을 1개로 제한하고 전체 결과를 누적하지 않는다.
- sample1 및 주소·경로·건수가 다른 실제 HTTP 테스트, 다수 페이지·큰 레코드·느린 처리·취소 테스트와 문서화된 실행 방법을 추가한다.
- 실제 플러그인 가공, DB 적재, 영속 checkpoint, sample2 단일 응답, CSV와 다른 pagination 방식은 포함하지 않는다.

## Capabilities

### New Capabilities

- `http-offset-collection`: 설정 기반 HTTP JSON offset 수집의 순차 묶음 전달, 완료 판정, 자원 제한과 오류·취소 동작을 정의한다.

### Modified Capabilities

- `plugin-source-contract`: 실행 시 필요한 timeout·응답 바이트·단일 레코드 바이트 한도를 JSON offset source 설정과 내부 수집 정의에 추가한다.

## Impact

- `packages/` 아래에 NestJS와 분리된 재사용 가능 수집 패키지와 Vitest 기반 HTTP 통합 테스트가 추가된다.
- `packages/plugin-config`의 source schema·TypeScript 타입·내부 `CollectionDefinition` 및 계약 테스트가 제한 설정을 포함하도록 확장된다.
- sample1 플러그인 설정, 루트 workspace 스크립트/lockfile과 수집 실행·설정·오류 규칙 문서가 영향을 받는다.
- mock API, 웹, 플랫폼 DB와 공개 조회 API의 동작은 변경하지 않는다.
