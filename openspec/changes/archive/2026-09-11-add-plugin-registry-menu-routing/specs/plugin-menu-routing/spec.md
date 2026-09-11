## Purpose

등록·검증된 플러그인 메뉴를 React 클라이언트에 일관되게 표시하고 URL에서 정확한 저장 레코드 조회 범위를 복원하는 공통 탐색 계약을 제공한다.

## ADDED Requirements

### Requirement: 검증된 registry로 메뉴를 생성한다
클라이언트는 빌드에 포함된 검증된 플러그인 registry 산출물만 사용하여 메뉴 제목, 아이콘, 그룹, 순서와 경로를 표시해야 한다(SHALL). 브라우저에서 플러그인 구조를 생성·수정하거나 원시 Git 설정을 다시 검증하지 않아야 한다(MUST).

#### Scenario: 등록된 메뉴 표시
- **WHEN** 서로 다른 그룹·순서·경로를 선언한 복수 플러그인이 유효한 registry 산출물에 포함된다
- **THEN** 클라이언트는 각 선언의 제목·아이콘·그룹·경로를 사용해 메뉴를 표시한다

#### Scenario: registry 등록 순서와 메뉴 표시 순서 분리
- **WHEN** registry 파일의 플러그인 배열 순서가 메뉴 선언의 정렬 순서와 다르다
- **THEN** 클라이언트는 그룹 이름, 오름차순 order, 제목, 경로 순으로 결정적으로 정렬하며 registry 배열 순서에 의존하지 않는다

#### Scenario: 다른 이름과 경로의 플러그인 추가
- **WHEN** 운영자가 유효한 메뉴를 가진 새 플러그인을 Git registry에 추가하고 다시 빌드한다
- **THEN** 클라이언트 코어의 메뉴·라우팅 코드를 수정하지 않아도 새 메뉴가 표시된다

### Requirement: 메뉴 경로를 조회 범위로 해석한다
클라이언트는 각 메뉴 경로를 정확히 하나의 `pluginId`, `sourceId`, `dataType` route context와 연결해야 한다(SHALL). 메뉴 선택, 직접 URL 접근과 새로고침은 동일한 context를 만들어야 한다(MUST).

#### Scenario: 메뉴 선택
- **WHEN** 사용자가 등록된 플러그인 메뉴를 선택한다
- **THEN** 브라우저 URL이 선언된 경로로 변경되고 연결된 `pluginId`, `sourceId`, `dataType` context가 레코드 영역에 제공된다

#### Scenario: 직접 URL 접근과 새로고침
- **WHEN** 사용자가 등록된 메뉴 경로를 직접 열거나 그 경로에서 페이지를 새로고침한다
- **THEN** 클라이언트는 메뉴 선택 때와 동일한 route context와 선택 상태를 복원한다

#### Scenario: route context placeholder
- **WHEN** 등록된 메뉴 경로가 활성화되었지만 선언형 목록·상세 renderer가 아직 제공되지 않는다
- **THEN** 화면은 해석된 플러그인 조회 범위를 식별할 수 있는 안전한 placeholder를 표시한다

### Requirement: 알 수 없는 경로를 안전하게 처리한다
클라이언트는 검증된 registry에 대응 항목이 없는 URL을 임의 플러그인 범위로 추정하지 않고 not-found 상태로 표시해야 한다(SHALL).

#### Scenario: 알 수 없는 경로
- **WHEN** 사용자가 어떤 등록 메뉴와도 일치하지 않는 URL을 연다
- **THEN** 클라이언트는 not-found 상태를 표시하고 레코드 조회 route context를 생성하지 않는다

#### Scenario: 등록 해제된 플러그인의 과거 URL
- **WHEN** 플러그인이 registry에서 제거된 빌드에서 사용자가 해당 플러그인의 과거 메뉴 URL을 연다
- **THEN** 클라이언트는 캐시된 구조를 사용하지 않고 not-found 상태를 표시한다

### Requirement: 정적 배포에서 직접 경로 접근을 지원한다
배포용 웹 서버는 `/api` 요청을 API로 전달하는 기존 경계를 유지하면서 등록 메뉴의 브라우저 직접 접근을 클라이언트 시작 문서로 제공해야 한다(SHALL).

#### Scenario: 배포 화면 새로고침
- **WHEN** 사용자가 배포용 Nginx에서 등록 메뉴 경로를 직접 요청하거나 새로고침한다
- **THEN** 웹 서버는 클라이언트 시작 문서를 반환하고 클라이언트는 해당 경로의 route context를 복원한다

#### Scenario: API fallback 제외
- **WHEN** 존재하지 않는 `/api/` 경로를 요청한다
- **THEN** 웹 서버는 클라이언트 시작 문서로 대체하지 않고 API 응답 상태를 유지한다

