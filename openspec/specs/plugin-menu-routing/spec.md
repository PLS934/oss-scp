# plugin-menu-routing Specification

## Purpose

등록·검증된 플러그인 메뉴를 React 클라이언트에 일관되게 표시하고 URL에서 정확한 저장 레코드 조회 범위를 복원하는 공통 탐색 계약을 제공한다.

## Requirements

### Requirement: 메뉴 상세 경로를 같은 조회 범위로 해석한다
클라이언트는 등록 메뉴의 내부 UUID 하위 경로를 해당 메뉴와 동일한 `pluginId`, `sourceId`, `dataType` context에 SHALL 연결해야 한다. 목록 이동, 직접 접근과 새로고침은 동일한 context를 만들어야 한다(MUST).

#### Scenario: 목록에서 상세 이동
- **WHEN** 사용자가 내부 UUID 레코드의 상세 링크를 선택한다
- **THEN** 같은 메뉴의 UUID 하위 경로와 조회 context가 상세 영역에 제공된다

#### Scenario: 직접 상세 URL 접근과 새로고침
- **WHEN** 사용자가 상세 경로를 직접 열거나 새로고침한다
- **THEN** 메뉴 선택 때와 동일한 context와 선택 상태를 복원한다

### Requirement: 검증된 registry로 메뉴를 생성한다
클라이언트는 서버가 기동 시 외부 설정 루트에서 검증한 플러그인 registry의 메뉴 산출물만 사용하여 메뉴 제목, 아이콘 식별자, 그룹, 순서와 경로를 해석해야 한다(SHALL). 클라이언트에 해당 식별자의 실제 아이콘 렌더러가 등록된 경우에만 제목 앞에 아이콘을 표시하고, 렌더러가 없으면 아이콘 관련 텍스트나 빈 영역 없이 제목만 표시해야 한다(MUST). 같은 산출물은 메뉴 조회 범위에 대응하는 검증된 기본 목록 columns의 `key`, `label`, `type`과 기본 상세 sections의 제목 및 필드 `key`, `label`, `type`을 제공해야 한다(SHALL). 브라우저에서 플러그인 구조를 생성·수정하거나 원시 Git 설정을 다시 검증하지 않아야 한다(MUST).

#### Scenario: 등록된 메뉴 표시
- **WHEN** 서로 다른 그룹·순서·경로와 기본 목록·상세를 선언한 복수 외부 플러그인이 서버의 검증된 메뉴 응답에 포함된다
- **THEN** 클라이언트는 각 선언의 제목·그룹·경로를 사용해 메뉴를 표시하고 해당 조회 범위의 검증된 목록 columns와 상세 sections를 사용할 수 있다

#### Scenario: 아이콘 렌더러가 없는 메뉴 표시
- **WHEN** 메뉴가 클라이언트에 실제 아이콘 렌더러가 등록되지 않은 아이콘 식별자를 선언한다
- **THEN** 클라이언트는 아이콘 이름의 대체 텍스트나 빈 아이콘 영역을 만들지 않고 선언된 메뉴 제목만 한 번 표시한다

#### Scenario: 아이콘 렌더러가 있는 메뉴 표시
- **WHEN** 메뉴가 클라이언트에 실제 아이콘 렌더러가 등록된 아이콘 식별자를 선언한다
- **THEN** 클라이언트는 선언된 메뉴 제목 앞에 해당 아이콘을 표시한다

#### Scenario: registry 등록 순서와 메뉴 표시 순서 분리
- **WHEN** 외부 registry 파일의 플러그인 배열 순서가 메뉴 선언의 정렬 순서와 다르다
- **THEN** 클라이언트는 그룹 이름, 오름차순 order, 제목, 경로 순으로 결정적으로 정렬하며 registry 배열 순서에 의존하지 않는다

#### Scenario: 다른 이름과 경로의 플러그인 추가
- **WHEN** 운영자가 유효한 메뉴와 기본 목록·상세를 가진 새 플러그인을 외부 Git registry에 추가하고 검증 후 서버를 재기동한다
- **THEN** 클라이언트 코어나 플랫폼 이미지를 다시 빌드하지 않아도 새 메뉴와 목록·상세 메타데이터가 제공된다

#### Scenario: registry 응답의 정보 경계
- **WHEN** 클라이언트가 검증된 메뉴와 기본 목록·상세 산출물을 조회한다
- **THEN** 응답은 조회에 필요한 식별자·표시 속성·선택된 목록 column·상세 section과 필드만 포함하고 원천 설정, Connection 값, 중첩 필드 schema와 서버 모듈 경로를 포함하지 않는다

#### Scenario: 메뉴 API 실패
- **WHEN** 클라이언트가 서버의 검증된 메뉴 산출물을 가져오지 못한다
- **THEN** 클라이언트는 빌드 시점 또는 캐시된 plugin registry로 대체하지 않고 명확한 로딩 실패 상태를 표시한다

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
