## Why

HTTP single 수집기의 완료 후 메모리 보관 회귀 검사가 Node.js 24.19.0에서 약 8.34 MiB를 보관한 것으로 반복 측정되어 전체 워크스페이스 테스트와 #78 전달을 막고 있다. 현재 측정은 같은 프로세스의 loopback 서버와 HTTP 런타임 메모리까지 포함하므로, 제품의 원천 응답 보관 계약을 실제로 검증하는 결정적인 경계를 마련해야 한다.

## What Changes

- 약 8.34 MiB 측정값이 collector 반환값이 아니라 응답을 생성한 loopback 서버 및 HTTP 런타임 객체 수명에서 비롯되는지 재현하고 근거를 기록한다.
- 완료된 collector 결과가 큰 원천 응답을 보관하지 않는다는 계약을 입력 크기 증가에 대한 비례 기반 검사로 검증하며, 서버 측 응답 생성 메모리를 측정 경계에서 분리한다.
- 진단 결과 실제 collector 참조 보관이 입증된 경우에만 해당 참조를 제거한다.
- Node.js 24.19.0에서 HTTP collector 테스트의 반복 통과와 전체 워크스페이스 테스트 통과를 확인한다.
- 고정 임계값의 단순 상향, assertion 삭제·skip, Node.js·의존성 변경, JSON streaming 도입, #78의 정기 수집 구현은 제외한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `http-single-collection`: 큰 응답 처리 완료 후 결과가 원천 응답 크기에 비례하는 메모리를 보관하지 않는다는 기존 제한 보관 계약의 회귀 검증 조건을 명확히 한다.

## Impact

- 영향 영역: `packages/http-collector`의 메모리 회귀 테스트와 worker, 필요 시에만 `collectHttpSingle` 구현.
- API, 설정 형식, 의존성, 런타임 버전에는 변경이 없다.
- 관련 이슈: GitHub #126. 이 변경은 #78의 전체 테스트 차단을 해소하지만 #78 자체 구현은 포함하지 않는다.
