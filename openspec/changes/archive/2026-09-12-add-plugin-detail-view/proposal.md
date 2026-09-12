## Why

#67이 기본 상세 표시 정의를, #53이 저장 레코드 기본 목록을 제공한다. 이제 두 계약을 연결해 플러그인별 React 코드 없이 목록에서 안전한 공통 상세 화면으로 이동하고 직접 URL을 복원할 수 있어야 한다.

## What Changes

- 기본 목록 각 행에 현재 메뉴 경로와 내부 UUID로 만든 상세 링크를 제공한다.
- 메뉴 경로의 내부 UUID 하위 route에서 상세 API를 호출하고 응답 범위를 검증한다.
- #67의 flat 상세 메타데이터로 scalar와 object·array를 실행 코드 없이 표시한다.
- null·누락, 잘못된 ID, 없는 레코드, 범위 불일치와 API 실패를 구분한다.
- 목록 이동, 직접 URL·새로고침, 목록 복귀와 오류 상태를 테스트하고 문서화한다.
- 큰 본문 다운로드, 관계 탐색, 수정, 중첩 필드 선택, 사용자 정의 화면과 권한은 포함하지 않는다.

## Capabilities

### New Capabilities

- `plugin-detail-view`: 검증된 상세 정의를 소비하는 공통 renderer와 상세 route·화면 상태를 규정한다.

### Modified Capabilities

- `plugin-record-list`: 목록 행에서 같은 메뉴의 내부 UUID 상세 경로로 이동한다.
- `plugin-menu-routing`: 등록 메뉴 아래의 상세 URL을 같은 조회 범위로 복원한다.

## Impact

- `apps/web`의 목록 링크, 상세 renderer, 라우팅, 스타일과 테스트가 변경된다.
- 브라우저 통합 테스트와 클라이언트 개발 문서가 확장된다.
- #67의 plugin schema·loader·메뉴 API 계약과 플러그인 설정, 저장 DB schema와 상세 API 계약은 변경하지 않는다.
