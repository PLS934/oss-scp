## Why

sample2의 검증된 `single` source 정의는 아직 실제 HTTP 요청을 실행하지 못하므로, 전체 JSON 응답의 레코드와 허용된 metadata를 후속 가공 단계에 안전하게 전달할 수 없다. 기존 offset 수집기의 HTTP·오류·자원 제한 기반을 재사용하면서, 반복 호출이나 `total`에 의존하지 않는 단일 요청 실행 계약이 필요하다.

## What Changes

- 검증된 JSON `single` 내부 수집 정의로 HTTP API를 정확히 한 번 호출하는 프레임워크 독립 실행기를 추가한다.
- 설정된 `itemsPath`의 배열을 원본 순서와 구조 그대로 처리 함수에 전달하고, `metadataPaths`로 선언된 값만 제한된 응답 metadata로 함께 전달한다.
- 정상 빈 배열과 잘못된 응답을 구분하고, 응답·레코드 크기 제한, timeout, 취소, HTTP·JSON·처리 오류를 기존 HTTP 수집기와 일관되게 처리한다.
- 처리 함수 완료를 기다리고 원본 응답이나 처리된 전체 데이터를 결과에 누적하지 않으며 작은 실행 요약만 반환한다.
- sample2 153건과 일반화된 다른 경로를 loopback HTTP 통합 테스트로 검증하고 지원 계약·제약·실행 명령을 문서화한다.
- 실제 가공 코드 실행, 플랫폼 DB 저장, checkpoint 영속화, retry, 인증과 NestJS 컨트롤러 연결은 포함하지 않는다.

## Capabilities

### New Capabilities

- `http-single-collection`: 설정 기반 JSON single HTTP 수집의 단일 요청, 레코드·metadata 전달, 자원 제한과 실패·취소 동작을 정의한다.

### Modified Capabilities

- `plugin-source-contract`: single source에도 HTTP 실행에 필요한 timeout·응답 바이트·단일 레코드 바이트 한도를 선언하고 내부 정의로 전달하도록 계약을 확장한다.

## Impact

- `packages/http-collector`: single 공개 API와 콜백·요약 타입을 추가하고 offset과 공유하는 HTTP·검증 기반을 정리한다.
- `packages/plugin-config`: single source schema·타입·loader에 HTTP 실행 한도를 추가한다.
- `plugins/sample2-single-api/source.json`: sample2 실행 한도를 명시한다.
- `packages/http-collector` 및 `packages/plugin-config` 테스트, 루트 CI 명령과 HTTP 수집 문서가 확장된다.
- 기존 `collectHttpOffset()` 공개 API, sample1 플러그인 설정과 offset 실행 동작은 호환성을 유지한다.
