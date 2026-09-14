## MODIFIED Requirements

### Requirement: 메뉴 경로를 조회 범위로 해석한다
클라이언트는 각 메뉴 경로를 정확히 하나의 `pluginId`, `sourceId`, `dataType` route context와 연결해야 한다(SHALL). 메뉴 선택, 직접 URL 접근과 새로고침은 동일한 context를 만들어야 한다(MUST). 활성 메뉴의 플러그인 ID와 화면 종류에 대응하는 사용자 정의 화면이 웹 빌드에 등록되어 있으면 해당 화면을 선택하고, 등록되어 있지 않으면 기존 공통 화면을 선택해야 한다(SHALL).

#### Scenario: 메뉴 선택
- **WHEN** 사용자가 등록된 플러그인 메뉴를 선택한다
- **THEN** 브라우저 URL이 선언된 경로로 변경되고 연결된 `pluginId`, `sourceId`, `dataType` context가 레코드 영역에 제공된다

#### Scenario: 직접 URL 접근과 새로고침
- **WHEN** 사용자가 등록된 메뉴 경로를 직접 열거나 그 경로에서 페이지를 새로고침한다
- **THEN** 클라이언트는 메뉴 선택 때와 동일한 route context와 선택 상태를 복원한다

#### Scenario: route context를 사용하는 사용자 정의 목록
- **WHEN** 등록된 메뉴 경로가 활성화되고 해당 플러그인의 사용자 정의 목록 화면이 등록되어 있다
- **THEN** 클라이언트는 해석된 route context와 검증된 목록 정의를 사용자 정의 목록 화면에 전달한다

#### Scenario: route context를 사용하는 기본 목록
- **WHEN** 등록된 메뉴 경로가 활성화되고 해당 플러그인의 사용자 정의 목록 화면이 등록되어 있지 않다
- **THEN** 클라이언트는 해석된 route context와 검증된 목록 정의를 공통 목록 화면에 전달하며, 레코드 표시와 로딩·실패 상태는 plugin-record-list 명세를 따른다
