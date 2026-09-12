## ADDED Requirements

### Requirement: 메뉴 상세 경로를 같은 조회 범위로 해석한다
클라이언트는 등록 메뉴의 내부 UUID 하위 경로를 해당 메뉴와 동일한 `pluginId`, `sourceId`, `dataType` context에 SHALL 연결해야 한다. 목록 이동, 직접 접근과 새로고침은 동일한 context를 만들어야 한다(MUST).

#### Scenario: 목록에서 상세 이동
- **WHEN** 사용자가 내부 UUID 레코드의 상세 링크를 선택한다
- **THEN** 같은 메뉴의 UUID 하위 경로와 조회 context가 상세 영역에 제공된다

#### Scenario: 직접 상세 URL 접근과 새로고침
- **WHEN** 사용자가 상세 경로를 직접 열거나 새로고침한다
- **THEN** 메뉴 선택 때와 동일한 context와 선택 상태를 복원한다
