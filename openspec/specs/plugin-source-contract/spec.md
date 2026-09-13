# plugin-source-contract Specification

## Purpose

플러그인이 원천 API의 호출·응답·반복 수집 정보를 선언하고 플랫폼이 이를 배포 전에 검증하여, 수집 코어 수정 없이 새로운 원천 설정을 추가할 수 있게 한다.

## Requirements

### Requirement: 최소 플러그인 선언
플랫폼은 플러그인의 계약 버전, 고유 식별자, 표시 이름, 릴리스 버전, 상대 source 파일 경로, 상대 가공 모듈 경로, 데이터 정의, 단일 메뉴 선언과 데이터 종류별 기본 목록·상세 선언을 외부 설정 루트의 `plugin.json`에서 선언할 수 있게 SHALL 제공해야 한다. 메뉴 선언은 제목, 지원 아이콘, 그룹, 정렬 순서, 절대 경로와 대상 데이터 종류를 포함해야 한다. 데이터 정의는 하나 이상의 데이터 종류, 각 종류의 필드와 타입, 사람이 읽을 수 있는 필수 표시명, 필수 여부, 유일키 및 선택적 관계를 포함해야 한다. 각 데이터 종류의 기본 목록은 비어 있지 않은 최상위 scalar 필드 참조를 순서대로 포함해야 하고, 기본 상세는 제목과 최상위 scalar·object·array 필드 참조를 가진 비어 있지 않은 섹션을 순서대로 포함해야 하며, 가공·화면 외의 지원하지 않는 설정을 필수로 요구하지 않아야 한다. 가공 모듈은 운영 배포 전에 생성된 JavaScript여야 하며(MUST), 플랫폼은 그 모듈의 요구 export를 기동 전에 검증해야 한다.

#### Scenario: 유효한 sample1 플러그인
- **WHEN** 운영자가 지원 계약 버전, 유효한 상대 source·사전 빌드 JavaScript 가공 모듈 경로, 표시명이 포함된 완전한 데이터 정의, 유효한 메뉴와 기본 목록·상세 선언을 가진 sample1 `plugin.json`을 외부 설정 루트에서 검증한다
- **THEN** 플랫폼은 해당 플러그인 선언을 실행 가능한 플러그인으로 승인하고 내부 수집 정의에 가공 모듈, 데이터 정의, 메뉴와 기본 목록·상세를 포함한다

#### Scenario: 등록된 sample2와 CSV 플러그인
- **WHEN** sample2와 CSV 샘플 플러그인이 외부 registry에 등록되어 있고 각각 유효한 가공 모듈, 표시명이 포함된 데이터 정의, 메뉴와 기본 목록·상세 선언을 제공한다
- **THEN** 플랫폼은 source 형식과 무관하게 각 플러그인의 내부 정의에도 가공 모듈, 데이터 정의, 메뉴와 기본 목록·상세를 포함한다

#### Scenario: 잘못된 플러그인 선언
- **WHEN** 계약 버전이나 필수 식별·메뉴·필드 표시명·기본 목록·상세 정보가 없거나 source·가공 모듈 경로가 플러그인 디렉터리 밖을 참조한다
- **THEN** 플랫폼은 문제 필드와 플러그인을 식별할 수 있는 오류로 선언을 거부한다

#### Scenario: 심볼릭 링크를 통한 경로 이탈
- **WHEN** registry, source, 로컬 파일 또는 가공 모듈의 해석된 실제 경로가 심볼릭 링크를 통해 허용된 외부 설정 루트 밖을 가리킨다
- **THEN** 플랫폼은 루트 밖의 파일을 읽거나 실행하지 않고 해당 참조를 거부한다

#### Scenario: 유효하지 않은 데이터 참조
- **WHEN** 유일키 또는 메뉴가 선언되지 않은 필드를 가리키거나 관계 또는 메뉴가 존재하지 않는 데이터 종류를 참조하거나 기본 목록·상세가 유효하지 않은 필드를 참조한다
- **THEN** 플랫폼은 외부 요청과 가공 모듈 실행 전에 해당 참조를 명시한 오류로 선언을 거부한다

#### Scenario: 지원하지 않는 메뉴 아이콘
- **WHEN** 플러그인 메뉴가 플랫폼의 고정 허용 목록에 없는 아이콘을 선언한다
- **THEN** 플랫폼은 대체 아이콘으로 조용히 변경하지 않고 해당 메뉴 선언을 검증 오류로 거부한다

#### Scenario: 가공 모듈 파일 누락
- **WHEN** 등록된 플러그인의 가공 모듈이 없거나 JavaScript가 아니거나 요구된 export를 제공하지 않는다
- **THEN** 플랫폼은 다른 경로의 파일을 대신 실행하거나 코드를 변환하지 않고 해당 플러그인의 검증을 실패한다

#### Scenario: 등록된 샘플 중 필수 가공 계약 누락
- **WHEN** sample1, sample2 또는 CSV를 포함한 등록 플러그인 중 하나가 가공 모듈, 표시명이 포함된 데이터 정의, 메뉴 또는 기본 목록·상세 선언을 제공하지 않는다
- **THEN** 플랫폼은 누락된 플러그인과 필드를 보고하고 전체 설정 검증을 성공으로 표시하지 않는다

### Requirement: registry 전체의 메뉴 참조와 경로를 검증한다
플랫폼은 등록된 모든 플러그인의 메뉴 경로 유일성과 메뉴 대상 데이터 종류를 배포 전에 함께 검증해야 한다(MUST). 유효한 설정 결과는 각 메뉴에 source 설정에서 해석한 `sourceId`와 플러그인·데이터 종류 식별자를 포함해야 한다(SHALL).

#### Scenario: 중복 메뉴 경로
- **WHEN** 서로 다른 등록 플러그인이 같은 정규화된 절대 메뉴 경로를 선언한다
- **THEN** 플랫폼은 충돌한 파일과 경로를 식별하는 오류로 전체 설정 검증을 실패한다

#### Scenario: 존재하지 않는 메뉴 데이터 종류
- **WHEN** 메뉴의 데이터 종류가 같은 플러그인의 `data.types`에 존재하지 않는다
- **THEN** 플랫폼은 해당 참조 위치와 알 수 없는 데이터 종류를 보고하고 설정을 거부한다

#### Scenario: 조회 범위가 포함된 메뉴 산출물
- **WHEN** 등록된 플러그인과 source·Connection 참조가 모두 유효하다
- **THEN** 플랫폼은 비밀정보와 base URL을 제외하고 `pluginId`, 해석된 `sourceId`, `dataType`과 표시 속성을 가진 클라이언트 메뉴 항목을 생성할 수 있다

### Requirement: JSON offset source 선언
플랫폼은 Connection 참조, 상대 HTTP 경로, GET 메서드, JSON 목록 경로, 전체 건수 경로와 offset·limit 파라미터 이름·시작값·묶음 크기, 요청 timeout·응답 바이트·단일 레코드 바이트 한도를 `source.json`에서 선언할 수 있게 SHALL 제공해야 한다. 모든 한도는 양의 정수여야 하고 단일 레코드 바이트 한도는 응답 바이트 한도를 넘지 않아야 하며, sample1의 업무 필드와 전체 건수는 source 계약에 고정하지 않아야 한다. single, 로컬 CSV 및 HTTP CSV 지원 추가로 기존 offset 선언이나 해석이 변경되지 않아야 한다.

#### Scenario: sample1 source 해석
- **WHEN** 운영자가 `/sample1`, `rows`, `total`, `offset`, `limit`, 묶음 크기와 유효한 실행 한도를 선언한 source를 검증한다
- **THEN** 플랫폼은 후속 수집기가 사용할 동일한 요청·응답·pagination·한도 정보를 반환한다

#### Scenario: 로컬 CSV와 함께 등록된 sample1
- **WHEN** 운영자가 기존 sample1 JSON offset 플러그인과 로컬·HTTP CSV 플러그인을 함께 등록해 검증한다
- **THEN** 플랫폼은 각 source 형식에 맞는 내부 수집 정의를 모두 반환하고 sample1 정의에는 변경을 만들지 않는다

#### Scenario: 지원하지 않는 수집 방식
- **WHEN** 운영자가 지원하지 않는 pagination 방식이나 HTTP 응답 형식을 선언한다
- **THEN** 플랫폼은 해당 방식을 실행 가능한 설정으로 승인하지 않고 지원하지 않는 값임을 명시한다

#### Scenario: 유효하지 않은 실행 한도
- **WHEN** timeout이나 바이트 한도가 허용 범위 밖이거나 단일 레코드 바이트 한도가 응답 바이트 한도보다 크다
- **THEN** 플랫폼은 외부 요청을 시작하기 전에 해당 설정 경로를 식별하여 검증을 실패한다

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

### Requirement: single 원천 응답 구조 보존 경계
플랫폼의 single source 계약은 목록 경로가 가리키는 레코드의 중첩 객체·배열을 삭제하거나 업무 필드로 재해석하지 않고 후속 가공 단계에 전달해야 하며, 목록 밖 최상위 응답 속성은 source가 유효한 JSON 경로로 명시한 항목만 제한된 metadata로 SHALL 전달해야 한다. 원본 HTTP 응답 전체와 선언하지 않은 최상위 속성은 가공 문맥에 포함하지 않아야 한다.

#### Scenario: sample2의 중첩 및 최상위 값 접근
- **WHEN** sample2 source가 `items`를 목록 경로로, `test_field6`을 metadata 경로로 선언하고 수집 결과를 가공 단계에 전달한다
- **THEN** 가공 단계는 각 항목의 `test_field2` 배열과 `test_field3` 객체 및 최상위 `test_field6`에 원천 구조대로 접근할 수 있다

#### Scenario: 선언하지 않은 최상위 값 제외
- **WHEN** single 응답에 metadata 경로로 선언하지 않은 최상위 속성이 존재한다
- **THEN** 플랫폼은 해당 속성과 원본 HTTP 응답 전체를 가공 문맥에 포함하지 않는다

#### Scenario: 잘못된 metadata 경로
- **WHEN** single source가 유효하지 않거나 중복된 metadata 경로를 선언한다
- **THEN** 플랫폼은 외부 요청 전에 문제 위치를 포함한 설정 오류로 source를 거부한다

### Requirement: 샘플 API Connection 독립성
플랫폼은 sample1과 sample2가 서로 다른 원천 API임을 확인할 수 있도록 각 source가 대칭적인 `mock-api-sample1`·`mock-api-sample2` Connection ID와 서로 다른 base URL을 사용하게 SHALL 구성해야 한다. 기본 로컬 예제에서 sample1은 `127.0.0.1:3001`, sample2는 `127.0.0.1:3002`를 사용해야 한다.

#### Scenario: 서로 다른 샘플 API 정의
- **WHEN** 운영자가 등록된 sample1과 sample2 설정을 검증한다
- **THEN** 두 내부 수집 정의는 서로 다른 Connection ID와 base URL을 반환한다

#### Scenario: Connection별 독립 변경
- **WHEN** 임시 설정에서 sample2 Connection의 base URL만 변경한다
- **THEN** sample2 내부 정의만 변경되고 sample1 내부 정의는 영향을 받지 않는다

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

### Requirement: 형식별 source 구조 검증
플랫폼은 같은 source 계약 버전 아래에서 HTTP JSON offset·single, 로컬 CSV와 HTTP CSV의 형식별 필수·허용 속성을 SHALL 구분해야 하며, 등록된 모든 플러그인의 source를 배포 전에 함께 검증해야 한다.

#### Scenario: 복수 source 형식 검증
- **WHEN** 등록 목록에 유효한 HTTP JSON, 로컬 CSV와 HTTP CSV 플러그인이 함께 존재한다
- **THEN** 플랫폼은 외부 요청이나 파일 전체 읽기 없이 모든 설정의 구조·참조·경로를 검증한다

#### Scenario: 형식 속성 혼용
- **WHEN** source가 한 형식의 식별자와 다른 형식 전용 속성을 함께 선언한다
- **THEN** 플랫폼은 혼용된 속성의 위치를 포함해 설정 검증을 실패한다

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
- **WHEN** 사용자가 저장소의 sample1·sample2·로컬 CSV 플러그인과 서로 다른 mock Connection에 대해 문서화된 검증 명령을 실행한다
- **THEN** 실제 외부 시스템이나 자격증명 없이 두 HTTP 정의와 로컬 CSV 정의의 검증이 성공한다

#### Scenario: 여러 검증 오류 보고
- **WHEN** 여러 설정 파일에 구조 또는 참조 오류가 있다
- **THEN** 검증 결과는 비밀정보를 출력하지 않으면서 각 파일과 오류 위치를 구분해 보고한다

### Requirement: source 방식의 독립 확장
플랫폼은 플러그인, source와 Connection 책임을 분리하여 새로운 source 방식이 기존 HTTP JSON offset·single, 로컬 CSV 및 HTTP CSV 동작을 변경하지 않고 추가될 수 있는 경계를 SHALL 유지해야 한다. 새 플러그인 등록을 위해 기존 플러그인의 식별 정보·source 설정·Connection 참조를 변경하도록 요구하지 않아야 한다(SHALL).

#### Scenario: sample2 플러그인 추가
- **WHEN** 운영자가 sample2 single source를 별도 플러그인으로 등록한다
- **THEN** 기존 sample1 플러그인의 식별 정보·offset 설정·Connection 참조는 유지되고 sample1·sample2 독립 Connection이 함께 검증된다

#### Scenario: 기존 로컬 CSV와 함께 sample2 추가
- **WHEN** 운영자가 로컬 CSV source가 등록된 상태에서 sample2 single source를 추가한다
- **THEN** 기존 sample1 offset과 로컬 CSV 플러그인의 설정 및 내부 정의를 유지한 채 새 플러그인을 등록할 수 있다

#### Scenario: 새로운 샘플 형식 계획
- **WHEN** 후속 변경에서 새로운 source 방식을 추가한다
- **THEN** 기존 sample1 offset, sample2 single 및 로컬 CSV 플러그인 파일을 변경하지 않고 새 플러그인을 등록할 수 있다
