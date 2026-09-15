## ADDED Requirements

### Requirement: 메뉴에 최소 정렬 메타데이터를 제공한다
검증된 메뉴의 목록 정의는 정렬 가능으로 선언된 컬럼의 `key`, `label`, `type`만 선언 순서로 SHALL 제공해야 하며 원천 설정이나 목록 밖 필드 정보를 포함하지 않아야 한다.

#### Scenario: 정렬 메타데이터 노출
- **WHEN** 등록 플러그인의 일부 목록 컬럼만 정렬 가능으로 선언되어 있다
- **THEN** 메뉴 응답은 해당 컬럼의 key·label·type만 선언 순서대로 제공한다

#### Scenario: 기존 플러그인 호환
- **WHEN** 플러그인에 정렬 선언이 없다
- **THEN** 기존 columns·query 응답 형식을 유지하고 정렬 항목을 생략하거나 빈 목록으로 제공한다

