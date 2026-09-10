## MODIFIED Requirements

### Requirement: JSON offset source 선언
플랫폼은 Connection 참조, 상대 HTTP 경로, GET 메서드, JSON 목록 경로, 전체 건수 경로와 offset·limit 파라미터 이름·시작값·묶음 크기, 요청 timeout·응답 바이트·단일 레코드 바이트 한도를 `source.json`에서 선언할 수 있게 SHALL 제공해야 한다. 모든 한도는 양의 정수여야 하고 단일 레코드 바이트 한도는 응답 바이트 한도를 넘지 않아야 하며, sample1의 업무 필드와 전체 건수는 source 계약에 고정하지 않아야 한다. single 및 로컬 CSV 지원 추가로 기존 offset 선언이나 해석이 변경되지 않아야 한다.

#### Scenario: sample1 source 해석
- **WHEN** 운영자가 `/sample1`, `rows`, `total`, `offset`, `limit`, 묶음 크기와 유효한 실행 한도를 선언한 source를 검증한다
- **THEN** 플랫폼은 후속 수집기가 사용할 동일한 요청·응답·pagination·한도 정보를 반환한다

#### Scenario: 지원하지 않는 수집 방식
- **WHEN** 운영자가 이번 계약에서 지원하지 않는 HTTP CSV 다운로드 또는 offset·single 이외의 pagination 방식을 선언한다
- **THEN** 플랫폼은 해당 방식을 실행 가능한 설정으로 승인하지 않고 지원하지 않는 값임을 명시한다

#### Scenario: 로컬 CSV와 함께 등록된 sample1
- **WHEN** 운영자가 기존 sample1 JSON offset 플러그인과 로컬 CSV 플러그인을 함께 등록해 검증한다
- **THEN** 플랫폼은 각 source 형식에 맞는 내부 수집 정의를 모두 반환하고 sample1 정의에는 실행 한도를 추가한 것 외의 변경을 만들지 않는다

#### Scenario: 유효하지 않은 실행 한도
- **WHEN** timeout이나 바이트 한도가 허용 범위 밖이거나 단일 레코드 한도가 응답 한도보다 크다
- **THEN** 플랫폼은 외부 요청을 시작하기 전에 해당 설정 경로를 식별하여 검증을 실패한다
