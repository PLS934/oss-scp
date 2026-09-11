## ADDED Requirements

### Requirement: 목록 레코드에서 공통 상세로 이동한다
기본 목록은 각 저장 레코드의 내부 UUID를 같은 메뉴의 상세 경로에만 SHALL 사용해야 한다. `externalKey`를 route 식별자로 사용하지 않아야 한다(MUST NOT).

#### Scenario: 목록 행 상세 이동
- **WHEN** 사용자가 목록의 상세 링크를 선택한다
- **THEN** 현재 메뉴 경로와 해당 레코드 내부 UUID로 상세 URL을 생성한다

#### Scenario: 상세에서 목록 복귀
- **WHEN** 사용자가 목록 복귀 동작을 선택한다
- **THEN** 같은 플러그인의 등록 메뉴 경로로 이동한다
