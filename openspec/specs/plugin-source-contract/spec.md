# plugin-source-contract Specification

## Purpose

플러그인이 원천 API의 호출·응답·반복 수집 정보를 선언하고 플랫폼이 이를 배포 전에 검증하여, 수집 코어 수정 없이 새로운 원천 설정을 추가할 수 있게 한다.

## Requirements

### Requirement: 최소 플러그인 선언
플랫폼은 플러그인의 계약 버전, 고유 식별자, 표시 이름, 릴리스 버전과 상대 source 파일 경로를 `plugin.json`에서 선언할 수 있게 SHALL 제공해야 한다. 이번 계약에서 지원하지 않는 데이터·가공·화면 설정은 필수로 요구하지 않아야 한다.

#### Scenario: 유효한 sample1 플러그인
- **WHEN** 운영자가 지원 계약 버전과 유효한 상대 source 경로를 가진 sample1 `plugin.json`을 검증한다
- **THEN** 플랫폼은 해당 플러그인 선언을 유효한 최소 플러그인으로 승인한다

#### Scenario: 잘못된 플러그인 선언
- **WHEN** 계약 버전이나 필수 식별 정보가 없거나 source 경로가 플러그인 디렉터리 밖을 참조한다
- **THEN** 플랫폼은 문제 필드와 플러그인을 식별할 수 있는 오류로 선언을 거부한다

### Requirement: JSON offset source 선언
플랫폼은 Connection 참조, 상대 HTTP 경로, GET 메서드, JSON 목록 경로, 전체 건수 경로와 offset·limit 파라미터 이름·시작값·묶음 크기를 `source.json`에서 선언할 수 있게 SHALL 제공해야 한다. sample1의 업무 필드와 전체 건수는 source 계약에 고정하지 않아야 한다.

#### Scenario: sample1 source 해석
- **WHEN** 운영자가 `/sample1`, `rows`, `total`, `offset`, `limit`과 묶음 크기를 선언한 source를 검증한다
- **THEN** 플랫폼은 후속 수집기가 사용할 동일한 요청·응답·pagination 정보를 반환한다

#### Scenario: 지원하지 않는 수집 방식
- **WHEN** 운영자가 이번 계약에서 지원하지 않는 single JSON, CSV 또는 다른 pagination 방식을 선언한다
- **THEN** 플랫폼은 해당 방식을 실행 가능한 설정으로 승인하지 않고 지원하지 않는 값임을 명시한다

### Requirement: 환경별 HTTP Connection 분리
플랫폼은 HTTP base URL을 플러그인 밖의 Connection에서 관리하고 source가 고유 Connection ID로 참조하게 SHALL 해야 한다. 플러그인과 source에는 비밀정보나 환경별 base URL을 포함하지 않아야 한다.

#### Scenario: 로컬 mock Connection 결합
- **WHEN** sample1 source가 등록된 mock API Connection을 참조한다
- **THEN** 플랫폼은 Connection의 base URL과 source의 상대 경로를 결합할 수 있는 내부 수집 정의를 반환한다

#### Scenario: 존재하지 않는 Connection
- **WHEN** source의 Connection ID가 등록 목록에 존재하지 않는다
- **THEN** 플랫폼은 외부 요청을 시도하지 않고 해당 참조를 명시한 오류로 검증을 실패한다

#### Scenario: 플러그인에 접속 정보 포함
- **WHEN** plugin 또는 source 파일이 base URL이나 인증 비밀을 직접 선언한다
- **THEN** 플랫폼은 허용되지 않은 속성으로 검증을 실패한다

### Requirement: 배포 전 구조와 참조 검증
플랫폼은 JSON Schema 2020-12 구조 검증과 파일·Connection 교차 참조 검증을 SHALL 제공해야 하며, 등록된 설정 중 하나라도 유효하지 않으면 성공한 전체 검증으로 보고하지 않아야 한다.

#### Scenario: 외부 자격증명 없는 샘플 검증
- **WHEN** 사용자가 저장소의 sample1 플러그인과 mock Connection에 대해 문서화된 검증 명령을 실행한다
- **THEN** 실제 외부 시스템이나 자격증명 없이 내부 수집 정의 검증이 성공한다

#### Scenario: 여러 검증 오류 보고
- **WHEN** 여러 설정 파일에 구조 또는 참조 오류가 있다
- **THEN** 검증 결과는 비밀정보를 출력하지 않으면서 각 파일과 오류 위치를 구분해 보고한다

### Requirement: 후속 source 방식의 독립 확장
플랫폼은 플러그인, source와 Connection 책임을 분리하여 후속 sample2 단일 JSON 및 CSV 다운로드 플러그인이 기존 sample1 플러그인 파일을 변경하지 않고 추가될 수 있는 경계를 SHALL 유지해야 한다.

#### Scenario: 새로운 샘플 형식 계획
- **WHEN** 후속 변경에서 sample2 또는 CSV source 방식을 추가한다
- **THEN** 기존 sample1 플러그인의 식별 정보와 offset source 설정은 그대로 유지될 수 있다
