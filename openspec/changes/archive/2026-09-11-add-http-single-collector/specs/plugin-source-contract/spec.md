## MODIFIED Requirements

### Requirement: JSON single source 선언
플랫폼은 Connection 참조, 상대 HTTP 경로, GET 메서드, JSON 목록 경로, 한 번 요청하고 종료하는 `single` 수집 방식과 요청 timeout·응답 바이트·단일 레코드 바이트 한도를 `source.json`에서 선언할 수 있게 SHALL 제공해야 한다. 모든 한도는 양의 정수여야 하고 단일 레코드 바이트 한도는 응답 바이트 한도를 넘지 않아야 한다. single source는 offset·limit 파라미터나 전체 건수 경로를 요구하지 않아야 하며, API 경로·응답 데이터 경로·업무 필드·응답 건수를 코어에 고정하지 않아야 한다.

#### Scenario: sample2 source 해석
- **WHEN** 운영자가 sample1과 다른 Connection을 참조하며 `/sample2`, `items`, `single` 방식과 유효한 실행 한도를 선언한 source를 검증한다
- **THEN** 플랫폼은 후속 수집기가 사용할 sample2 전용 base URL, GET, 상대 경로, JSON 목록 경로, single 방식과 동일한 실행 한도를 포함한 내부 수집 정의를 반환한다

#### Scenario: 다른 single API 해석
- **WHEN** 운영자가 sample2와 다른 HTTP 경로·JSON 목록 경로와 유효한 실행 한도를 가진 single source를 등록한다
- **THEN** 플랫폼은 플러그인별 코어 코드 변경 없이 선언된 값을 내부 수집 정의로 반환한다

#### Scenario: 잘못된 single 설정
- **WHEN** single source에 필수 값이 없거나 offset 전용 속성, 잘못된 타입·버전·경로 또는 허용 범위 밖 실행 한도가 포함된다
- **THEN** 플랫폼은 외부 요청 전에 해당 파일과 문제 필드를 식별할 수 있는 오류로 설정을 거부한다

#### Scenario: 단일 레코드 한도가 응답 한도보다 큼
- **WHEN** single source의 단일 레코드 바이트 한도가 응답 바이트 한도보다 크다
- **THEN** 플랫폼은 외부 요청 전에 두 한도의 관계를 식별하여 설정 검증을 실패한다
