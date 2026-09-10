## ADDED Requirements

### Requirement: JSON single source 선언
플랫폼은 Connection 참조, 상대 HTTP 경로, GET 메서드, JSON 목록 경로와 한 번 요청하고 종료하는 `single` 수집 방식을 `source.json`에서 선언할 수 있게 SHALL 제공해야 한다. single source는 offset·limit 파라미터나 전체 건수 경로를 요구하지 않아야 하며, API 경로·응답 데이터 경로·업무 필드·응답 건수를 코어에 고정하지 않아야 한다.

#### Scenario: sample2 source 해석
- **WHEN** 운영자가 sample1과 다른 Connection을 참조하며 `/sample2`, `items`와 `single` 방식을 선언한 source를 검증한다
- **THEN** 플랫폼은 후속 수집기가 사용할 sample2 전용 base URL, GET, 상대 경로, JSON 목록 경로와 single 방식을 포함한 내부 수집 정의를 반환한다

#### Scenario: 다른 single API 해석
- **WHEN** 운영자가 sample2와 다른 HTTP 경로·JSON 목록 경로를 가진 유효한 single source를 등록한다
- **THEN** 플랫폼은 플러그인별 코어 코드 변경 없이 선언된 값을 내부 수집 정의로 반환한다

#### Scenario: 잘못된 single 설정
- **WHEN** single source에 필수 값이 없거나 offset 전용 속성, 잘못된 타입·버전·경로가 포함된다
- **THEN** 플랫폼은 해당 파일과 문제 필드를 식별할 수 있는 오류로 설정을 거부한다

### Requirement: single 원천 응답 구조 보존 경계
플랫폼의 single source 계약은 목록 경로가 가리키는 레코드의 중첩 객체·배열과 목록 밖 최상위 응답 속성을 삭제하거나 업무 필드로 재해석하지 않고 후속 가공 단계가 원천 응답에서 접근할 수 있는 경계를 SHALL 유지해야 한다.

#### Scenario: sample2의 중첩 및 최상위 값 접근
- **WHEN** 후속 수집기가 sample2 응답의 `items` 목록과 최상위 `test_field6`을 가공 단계에 전달한다
- **THEN** 가공 단계는 각 항목의 `test_field2` 배열과 `test_field3` 객체 및 최상위 `test_field6`에 원천 구조대로 접근할 수 있다

### Requirement: 샘플 API Connection 독립성
플랫폼은 sample1과 sample2가 서로 다른 원천 API임을 확인할 수 있도록 각 source가 대칭적인 `mock-api-sample1`·`mock-api-sample2` Connection ID와 서로 다른 base URL을 사용하게 SHALL 구성해야 한다. 기본 로컬 예제에서 sample1은 `127.0.0.1:3001`, sample2는 `127.0.0.1:3002`를 사용해야 한다.

#### Scenario: 서로 다른 샘플 API 정의
- **WHEN** 운영자가 등록된 sample1과 sample2 설정을 검증한다
- **THEN** 두 내부 수집 정의는 서로 다른 Connection ID와 base URL을 반환한다

#### Scenario: Connection별 독립 변경
- **WHEN** 임시 설정에서 sample2 Connection의 base URL만 변경한다
- **THEN** sample2 내부 정의만 변경되고 sample1 내부 정의는 영향을 받지 않는다

## MODIFIED Requirements

### Requirement: JSON offset source 선언
플랫폼은 Connection 참조, 상대 HTTP 경로, GET 메서드, JSON 목록 경로, 전체 건수 경로와 offset·limit 파라미터 이름·시작값·묶음 크기를 `source.json`에서 선언할 수 있게 SHALL 제공해야 한다. sample1의 업무 필드와 전체 건수는 source 계약에 고정하지 않아야 하며, single 지원 추가로 기존 offset 선언이나 해석이 변경되지 않아야 한다.

#### Scenario: sample1 source 해석
- **WHEN** 운영자가 `/sample1`, `rows`, `total`, `offset`, `limit`과 묶음 크기를 선언한 source를 검증한다
- **THEN** 플랫폼은 후속 수집기가 사용할 동일한 요청·응답·pagination 정보를 반환한다

#### Scenario: 로컬 CSV와 함께 등록된 sample1
- **WHEN** 운영자가 기존 sample1 JSON offset 플러그인과 로컬 CSV 플러그인을 함께 등록해 검증한다
- **THEN** 플랫폼은 각 source 형식에 맞는 내부 수집 정의를 모두 반환하고 sample1 정의를 변경하지 않는다

#### Scenario: 지원하지 않는 수집 방식
- **WHEN** 운영자가 이번 계약에서 지원하지 않는 HTTP CSV 다운로드 또는 offset·single 이외의 pagination 방식을 선언한다
- **THEN** 플랫폼은 해당 방식을 실행 가능한 설정으로 승인하지 않고 지원하지 않는 값임을 명시한다

### Requirement: 배포 전 구조와 참조 검증
플랫폼은 JSON Schema 2020-12 구조 검증과 파일·Connection 교차 참조 검증을 SHALL 제공해야 하며, 등록된 설정 중 하나라도 유효하지 않으면 성공한 전체 검증으로 보고하지 않아야 한다.

#### Scenario: 외부 자격증명 없는 샘플 검증
- **WHEN** 사용자가 저장소의 sample1·sample2·로컬 CSV 플러그인과 서로 다른 mock Connection에 대해 문서화된 검증 명령을 실행한다
- **THEN** 실제 외부 시스템이나 자격증명 없이 두 HTTP 정의와 로컬 CSV 정의의 검증이 성공한다

#### Scenario: 여러 검증 오류 보고
- **WHEN** 여러 설정 파일에 구조 또는 참조 오류가 있다
- **THEN** 검증 결과는 비밀정보를 출력하지 않으면서 각 파일과 오류 위치를 구분해 보고한다

### Requirement: 후속 source 방식의 독립 확장
플랫폼은 플러그인, source와 Connection 책임을 분리하여 sample2 단일 JSON 플러그인과 후속 source 방식이 기존 sample1 offset 및 로컬 CSV 동작을 변경하지 않고 추가될 수 있는 경계를 SHALL 유지해야 한다. 이번 Connection 이름 대칭화에 필요한 sample1 `connectionRef` 변경 외에는 sample1 설정을 변경하지 않아야 한다.

#### Scenario: sample2 플러그인 추가
- **WHEN** 운영자가 sample2 single source를 별도 플러그인으로 등록한다
- **THEN** 기존 sample1 플러그인의 식별 정보와 offset 설정은 유지되고 이름이 대칭화된 sample1·sample2 독립 Connection이 함께 검증된다

#### Scenario: 기존 로컬 CSV와 함께 sample2 추가
- **WHEN** 운영자가 로컬 CSV source가 등록된 상태에서 sample2 single source를 추가한다
- **THEN** 기존 sample1 offset과 로컬 CSV 플러그인의 설정 및 내부 정의를 유지한 채 새 플러그인을 등록할 수 있다

#### Scenario: 새로운 샘플 형식 계획
- **WHEN** 후속 변경에서 새로운 source 방식을 추가한다
- **THEN** 기존 sample1 offset, sample2 single 및 로컬 CSV 플러그인 파일을 변경하지 않고 새 플러그인을 등록할 수 있다
