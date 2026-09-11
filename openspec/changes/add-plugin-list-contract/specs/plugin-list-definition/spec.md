## Purpose

플러그인이 데이터 종류별 기본 목록 컬럼과 표시 정보를 선언하고 플랫폼이 이를 검증된 최소 클라이언트 계약으로 제공하게 한다.

## ADDED Requirements

### Requirement: 데이터 종류별 기본 목록을 선언한다
플랫폼은 각 플러그인 데이터 종류에 비어 있지 않은 기본 목록 `columns`를 순서대로 선언하게 SHALL 해야 한다. 각 column은 같은 데이터 종류에 선언된 최상위 scalar 필드 하나를 참조해야 하며(MUST), scalar 타입은 `string`, `number`, `boolean`, `datetime`으로 제한해야 한다(MUST).

#### Scenario: 유효한 기본 목록 선언
- **WHEN** 데이터 종류가 서로 다른 최상위 scalar 필드만 기본 목록 columns에 선언한다
- **THEN** 플랫폼은 선언 순서를 보존한 목록 정의로 플러그인을 승인한다

#### Scenario: 비어 있거나 중복된 columns
- **WHEN** 기본 목록 columns가 비어 있거나 같은 필드를 두 번 이상 포함한다
- **THEN** 플랫폼은 문제 데이터 종류와 columns 위치를 식별하는 오류로 설정을 거부한다

#### Scenario: 존재하지 않는 필드 참조
- **WHEN** 기본 목록 column이 같은 데이터 종류에 선언되지 않은 필드를 참조한다
- **THEN** 플랫폼은 해당 column과 알 수 없는 필드 key를 식별하는 오류로 설정을 거부한다

#### Scenario: 중첩 타입 필드 참조
- **WHEN** 기본 목록 column이 object 또는 array 타입 필드를 참조한다
- **THEN** 플랫폼은 scalar 필드만 허용된다는 오류로 설정을 거부한다

### Requirement: 검증된 목록 컬럼 메타데이터를 제공한다
플랫폼은 검증된 각 기본 목록 column을 `key`, 필드 `label`, scalar `type`만 가진 클라이언트 목록 메타데이터로 SHALL 생성해야 한다. 생성된 항목은 해당 메뉴의 `pluginId`, `sourceId`, `dataType` 조회 범위에 결합되어야 하며(MUST), 원천 설정·Connection 값·가공 모듈 경로·선택되지 않은 필드 정의를 포함하지 않아야 한다(MUST NOT).

#### Scenario: 목록 메타데이터 생성
- **WHEN** 등록 플러그인의 데이터 종류와 기본 목록 선언이 유효하다
- **THEN** 런타임 메뉴 응답은 선언 순서대로 해석된 `key`, `label`, `type`과 해당 조회 범위를 제공한다

#### Scenario: 서로 다른 구조의 샘플 플러그인
- **WHEN** sample1과 중첩 object·array 필드도 가진 sample2가 각각 유효한 scalar 기본 columns를 선언한다
- **THEN** 플랫폼은 source 형식이나 데이터 구조별 코어 매핑 없이 각 플러그인의 목록 메타데이터를 생성한다

#### Scenario: 서버 전용 정보 제외
- **WHEN** 클라이언트가 런타임 메뉴 응답을 조회한다
- **THEN** 응답에는 base URL, Connection 설정, source 요청 정보와 가공 모듈 경로가 포함되지 않는다

