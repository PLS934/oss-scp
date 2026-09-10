## Why

HTTP 수집 기능이 API 주소와 응답 구조를 코드에 직접 고정하지 않으려면, 플러그인이 수집에 필요한 정보를 선언하고 플랫폼이 배포 전에 검증하는 최소 계약이 먼저 필요하다. 서비스 운영자는 이 계약을 사용해 외부 자격증명 없이 sample1 mock API 연동을 확인하고, 이후 다른 JSON·CSV 원천을 독립된 플러그인으로 추가할 수 있어야 한다.

## What Changes

- sample1 mock API를 대상으로 하는 최소 샘플 플러그인과 source 설정을 추가한다.
- `plugin.json`은 플러그인 식별자·계약 버전·source 참조를 선언하고, `source.json`은 REST 요청·응답 경로와 offset pagination을 선언한다.
- 환경별 mock API base URL을 플러그인 밖의 Connection에 분리한다.
- JSON Schema와 교차 참조 검증으로 잘못된 계약 버전, 파일 경로, Connection 참조와 수집 설정을 배포 전에 거부한다.
- 검증된 파일을 후속 HTTP 수집기가 사용할 내부 수집 정의로 해석한다.
- sample2 단일 JSON과 CSV 다운로드는 이번 구현에서 지원하지 않으며, 이후 별도 플러그인과 source 방식으로 추가한다.

## Capabilities

### New Capabilities

- `plugin-source-contract`: 플러그인·source·Connection 파일의 최소 선언, 검증 및 내부 수집 정의 해석 계약

### Modified Capabilities

없음.

## Impact

- 새 플러그인·Connection·JSON Schema 디렉터리와 설정 검증 모듈이 추가된다.
- 샘플 작성·검증 명령과 CI 검사가 추가된다.
- 실제 HTTP 호출, 가공 코드, 데이터 필드·유일키, DB·checkpoint, 메뉴·화면 계약은 변경하지 않는다.
- 후속 #15 HTTP 수집 기능은 이 변경이 제공하는 내부 수집 정의에 의존한다.
