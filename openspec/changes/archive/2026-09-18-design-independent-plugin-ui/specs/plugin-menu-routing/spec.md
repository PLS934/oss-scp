## MODIFIED Requirements

### Requirement: 메뉴 경로를 조회 범위로 해석한다
클라이언트는 각 메뉴 경로를 정확히 하나의 `pluginId`, `sourceId`, `dataType` route context와 연결해야 한다(SHALL). 메뉴 선택, 직접 URL 접근과 새로고침은 동일한 context를 만들어야 한다(MUST). 활성 메뉴의 검증 완료 UI descriptor가 해당 화면 종류를 선언하면 사용자 정의 화면을 비동기로 로드하고, 선언하지 않으면 기존 공통 화면을 선택해야 한다(SHALL).

#### Scenario: 메뉴 선택
- **WHEN** 사용자가 등록된 플러그인 메뉴를 선택한다
- **THEN** 브라우저 URL이 선언된 경로로 변경되고 연결된 `pluginId`, `sourceId`, `dataType` context가 레코드 영역에 제공된다

#### Scenario: 직접 URL 접근과 새로고침
- **WHEN** 사용자가 등록된 메뉴 경로를 직접 열거나 그 경로에서 페이지를 새로고침한다
- **THEN** 클라이언트는 메뉴 선택 때와 동일한 route context와 선택 상태를 복원한다

#### Scenario: route context를 사용하는 사용자 정의 목록
- **WHEN** 등록된 메뉴 경로가 활성화되고 검증 완료 UI descriptor가 사용자 정의 목록 화면을 선언한다
- **THEN** 클라이언트는 해당 번들을 로드하고 해석된 route context와 검증된 목록 정의를 사용자 정의 목록 화면에 전달한다

#### Scenario: route context를 사용하는 기본 목록
- **WHEN** 등록된 메뉴 경로가 활성화되고 검증 완료 UI descriptor가 사용자 정의 목록 화면을 선언하지 않는다
- **THEN** 클라이언트는 해석된 route context와 검증된 목록 정의를 공통 목록 화면에 전달하며, 레코드 표시와 로딩·실패 상태는 plugin-record-list 명세를 따른다

#### Scenario: 사용자 정의 목록 로드 실패
- **WHEN** 검증 완료 UI descriptor의 사용자 정의 목록 번들을 로드하거나 요구 export를 해석할 수 없다
- **THEN** 클라이언트는 공통 목록으로 자동 전환하지 않고 해당 route 영역에 안전한 UI 실패 상태를 표시한다
