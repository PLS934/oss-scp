# plugin-detail-definition Specification

## Purpose

플러그인이 데이터 종류별 기본 상세 화면의 섹션과 필드 순서를 선언하고, 플랫폼이 이를 검증된 최소 클라이언트 계약으로 제공하게 한다.

## Requirements

### Requirement: 데이터 종류별 기본 상세 섹션을 선언한다
플랫폼은 각 플러그인 데이터 종류에 비어 있지 않은 기본 상세 `sections`를 순서대로 선언하게 SHALL 해야 한다. 각 section은 비어 있지 않은 고유 제목과 비어 있지 않은 필드 참조 목록을 포함해야 하며(MUST), 각 참조는 같은 데이터 종류에 선언된 최상위 필드를 가리켜야 한다(MUST). 기본 상세는 선언된 필드 중 일부만 선택할 수 있으며 scalar, object와 array 필드를 허용해야 한다(SHALL).

#### Scenario: 서로 다른 타입을 포함한 유효한 상세 선언
- **WHEN** 데이터 종류가 고유한 제목의 섹션들에 서로 다른 최상위 scalar·object·array 필드를 선언한다
- **THEN** 플랫폼은 섹션과 필드 순서를 보존한 상세 정의로 플러그인을 승인한다

#### Scenario: 비어 있는 상세 또는 섹션
- **WHEN** 상세 sections가 비어 있거나 section의 제목 또는 fields가 비어 있다
- **THEN** 플랫폼은 빈 값의 정확한 설정 경로를 포함한 검증 오류로 플러그인을 거부한다

#### Scenario: 중복 섹션 제목
- **WHEN** 같은 데이터 종류의 상세 sections에 같은 제목이 두 번 이상 선언된다
- **THEN** 플랫폼은 두 번째 중복 제목의 위치와 원인을 포함한 검증 오류로 플러그인을 거부한다

#### Scenario: 존재하지 않는 상세 필드
- **WHEN** section이 같은 데이터 종류에 선언되지 않은 필드를 참조한다
- **THEN** 플랫폼은 해당 참조 위치와 알 수 없는 필드 key를 포함한 검증 오류로 플러그인을 거부한다

#### Scenario: 섹션을 가로지르는 중복 필드
- **WHEN** 같은 최상위 필드가 한 section 안에서 또는 여러 section에 걸쳐 두 번 이상 참조된다
- **THEN** 플랫폼은 두 번째 중복 참조 위치와 원인을 포함한 검증 오류로 플러그인을 거부한다

#### Scenario: 선언됐지만 선택되지 않은 필드
- **WHEN** 데이터 종류의 일부 필드가 어떤 상세 section에도 참조되지 않는다
- **THEN** 플랫폼은 나머지 상세 선언이 유효하면 해당 필드를 상세 산출물에서 제외하고 플러그인을 승인한다

### Requirement: 검증된 최소 상세 정의를 생성한다
플랫폼은 검증된 section마다 제목과 선언 순서대로 선택된 필드의 `key`, `label`, `type`만 포함하는 클라이언트 상세 정의를 SHALL 생성해야 한다. 상세 정의는 메뉴가 가리키는 `pluginId`, `sourceId`, `dataType` 조회 범위와 함께 제공되어야 하며(MUST), 선택되지 않은 필드, object·array의 중첩 schema, 원천 설정, Connection 값과 서버 모듈 경로를 포함하지 않아야 한다(MUST).

#### Scenario: 상세 정의 생성
- **WHEN** 등록된 플러그인의 메뉴 대상 데이터 종류와 상세 sections가 유효하다
- **THEN** 플랫폼은 섹션·필드 순서와 각 필드의 검증된 key·label·type을 보존한 상세 정의를 해당 메뉴 산출물에 포함한다

#### Scenario: object와 array 상세 필드
- **WHEN** 상세 section이 기존 공개 필드 계약에 맞는 최상위 object 또는 array 필드를 참조한다
- **THEN** 클라이언트 상세 정의는 해당 필드의 key·label과 `object` 또는 `array` 타입만 제공하여 실행 코드 없이 타입 기반 renderer가 처리할 수 있게 한다

#### Scenario: 클라이언트 정보 경계
- **WHEN** 클라이언트가 검증된 메뉴와 상세 정의 산출물을 조회한다
- **THEN** 응답에는 상세 표시에 선택된 최소 메타데이터만 있고 중첩 필드 정의, source 요청, Connection, base URL과 transform 경로가 없다

#### Scenario: 구조가 다른 플러그인 재사용
- **WHEN** sample1과 object·array 필드를 가진 sample2가 서로 다른 상세 섹션 구성을 선언한다
- **THEN** 플랫폼은 플러그인별 코어 매핑 없이 각 선언에서 같은 형태의 클라이언트 상세 정의를 생성한다
