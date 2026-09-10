## MODIFIED Requirements

### Requirement: JSON offset source 선언
플랫폼은 Connection 참조, 상대 HTTP 경로, GET 메서드, JSON 목록 경로, 전체 건수 경로와 offset·limit 파라미터 이름·시작값·묶음 크기를 `source.json`에서 선언할 수 있게 SHALL 제공해야 한다. sample1의 업무 필드와 전체 건수는 source 계약에 고정하지 않아야 하며, JSON offset source의 기존 설정과 내부 수집 정의는 로컬 CSV source 추가 후에도 동일하게 유지되어야 한다.

#### Scenario: sample1 source 해석
- **WHEN** 운영자가 `/sample1`, `rows`, `total`, `offset`, `limit`과 묶음 크기를 선언한 source를 검증한다
- **THEN** 플랫폼은 후속 수집기가 사용할 동일한 요청·응답·pagination 정보를 반환한다

#### Scenario: 로컬 CSV와 함께 등록된 sample1
- **WHEN** 운영자가 기존 sample1 JSON offset 플러그인과 로컬 CSV 플러그인을 함께 등록해 검증한다
- **THEN** 플랫폼은 각 source 형식에 맞는 내부 수집 정의를 모두 반환하고 sample1 정의를 변경하지 않는다

#### Scenario: 지원하지 않는 수집 방식
- **WHEN** 운영자가 이번 계약에서 지원하지 않는 single JSON, HTTP CSV 다운로드 또는 다른 pagination 방식을 선언한다
- **THEN** 플랫폼은 해당 방식을 실행 가능한 설정으로 승인하지 않고 지원하지 않는 값임을 명시한다

## ADDED Requirements

### Requirement: 형식별 source 구조 검증
플랫폼은 같은 source 계약 버전 아래에서 HTTP JSON offset과 로컬 CSV의 형식별 필수·허용 속성을 SHALL 구분해야 하며, 등록된 모든 플러그인의 source를 배포 전에 함께 검증해야 한다.

#### Scenario: 복수 source 형식 검증
- **WHEN** 등록 목록에 유효한 HTTP JSON offset과 로컬 CSV 플러그인이 함께 존재한다
- **THEN** 플랫폼은 외부 요청이나 파일 전체 읽기 없이 두 설정의 구조·참조·경로를 검증한다

#### Scenario: 형식 속성 혼용
- **WHEN** source가 한 형식의 식별자와 다른 형식 전용 속성을 함께 선언한다
- **THEN** 플랫폼은 혼용된 속성의 위치를 포함해 설정 검증을 실패한다
