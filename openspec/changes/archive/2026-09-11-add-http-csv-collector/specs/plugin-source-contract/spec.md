## ADDED Requirements

### Requirement: HTTP CSV source 선언
플랫폼은 HTTP Connection 참조, 상대 요청 경로, GET 메서드, CSV 형식, 묶음 행 수, 요청 timeout, 전송 바이트·압축 해제 후 바이트·단일 레코드 한도를 `source.json`에서 선언할 수 있게 SHALL 제공해야 한다. base URL과 인증 참조는 Connection에만 두고 source에는 포함하지 않아야 하며, 원천 문자열의 업무 타입 변환을 수행하지 않아야 한다.

#### Scenario: 유효한 HTTP CSV source
- **WHEN** 운영자가 등록된 HTTP Connection, 상대 CSV 경로와 유효한 묶음·실행 한도를 선언한다
- **THEN** 플랫폼은 후속 실행기가 사용할 base URL, 요청, CSV 묶음과 한도를 포함한 HTTP CSV 수집 정의를 반환한다

#### Scenario: 잘못된 HTTP CSV 설정
- **WHEN** HTTP CSV source에 필수 값이 없거나 로컬 파일·JSON pagination 전용 속성 또는 허용 범위 밖 한도가 포함된다
- **THEN** 플랫폼은 외부 요청 전에 해당 파일과 문제 필드를 식별하는 오류로 설정을 거부한다

#### Scenario: 존재하지 않는 Connection
- **WHEN** HTTP CSV source가 등록되지 않은 Connection을 참조한다
- **THEN** 플랫폼은 다운로드를 시도하지 않고 해당 참조를 명시한 오류로 검증을 실패한다

## MODIFIED Requirements

### Requirement: JSON offset source 선언
플랫폼은 Connection 참조, 상대 HTTP 경로, GET 메서드, JSON 목록 경로, 전체 건수 경로와 offset·limit 파라미터 이름·시작값·묶음 크기, 요청 timeout·응답 바이트·단일 레코드 바이트 한도를 `source.json`에서 선언할 수 있게 SHALL 제공해야 한다. 모든 한도는 양의 정수여야 하고 단일 레코드 바이트 한도는 응답 바이트 한도를 넘지 않아야 하며, sample1의 업무 필드와 전체 건수는 source 계약에 고정하지 않아야 한다. single, 로컬 CSV 및 HTTP CSV 지원 추가로 기존 offset 선언이나 해석이 변경되지 않아야 한다.

#### Scenario: sample1 source 해석
- **WHEN** 운영자가 `/sample1`, `rows`, `total`, `offset`, `limit`, 묶음 크기와 유효한 실행 한도를 선언한 source를 검증한다
- **THEN** 플랫폼은 후속 수집기가 사용할 동일한 요청·응답·pagination·한도 정보를 반환한다

#### Scenario: 로컬 CSV와 함께 등록된 sample1
- **WHEN** 운영자가 기존 sample1 JSON offset 플러그인과 로컬·HTTP CSV 플러그인을 함께 등록해 검증한다
- **THEN** 플랫폼은 각 source 형식에 맞는 내부 수집 정의를 모두 반환하고 sample1 정의에는 변경을 만들지 않는다

#### Scenario: 지원하지 않는 수집 방식
- **WHEN** 운영자가 이번 계약에서 지원하지 않는 pagination 방식이나 HTTP 응답 형식을 선언한다
- **THEN** 플랫폼은 해당 방식을 실행 가능한 설정으로 승인하지 않고 지원하지 않는 값임을 명시한다

#### Scenario: 유효하지 않은 실행 한도
- **WHEN** timeout이나 바이트 한도가 허용 범위 밖이거나 단일 레코드 바이트 한도가 응답 바이트 한도보다 크다
- **THEN** 플랫폼은 외부 요청을 시작하기 전에 해당 설정 경로를 식별하여 검증을 실패한다

### Requirement: 형식별 source 구조 검증
플랫폼은 같은 source 계약 버전 아래에서 HTTP JSON offset·single, 로컬 CSV와 HTTP CSV의 형식별 필수·허용 속성을 SHALL 구분해야 하며, 등록된 모든 플러그인의 source를 배포 전에 함께 검증해야 한다.

#### Scenario: 복수 source 형식 검증
- **WHEN** 등록 목록에 유효한 HTTP JSON, 로컬 CSV와 HTTP CSV 플러그인이 함께 존재한다
- **THEN** 플랫폼은 외부 요청이나 파일 전체 읽기 없이 모든 설정의 구조·참조·경로를 검증한다

#### Scenario: 형식 속성 혼용
- **WHEN** source가 한 형식의 식별자와 다른 형식 전용 속성을 함께 선언한다
- **THEN** 플랫폼은 혼용된 속성의 위치를 포함해 설정 검증을 실패한다
