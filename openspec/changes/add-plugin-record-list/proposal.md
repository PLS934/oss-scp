## Why

플러그인 메뉴와 저장 레코드 조회 API는 준비됐지만 React 화면은 아직 조회 범위 placeholder만 표시한다. 보안팀과 개발팀이 저장된 데이터를 확인하려면 플러그인별 React 코드를 추가하지 않고 검증된 기본 컬럼 정의를 사용하는 공통 목록 화면이 필요하다.

## What Changes

- 메뉴 route context의 `pluginId`, `sourceId`, `dataType`으로 플랫폼 저장 레코드 API를 조회한다.
- 플러그인의 검증된 `list.columns` 순서·표시명·scalar 타입으로 공통 테이블을 렌더링하고 선언되지 않은 필드는 표시하지 않는다.
- string·number·boolean·datetime 값을 일관되게 표시하고 null·누락 값은 명확한 빈 표현으로 처리한다.
- cursor 없는 첫 묶음과 `nextCursor` 기반 다음 묶음 이동을 지원하며 `hasNextPage=false`이면 다음 이동을 비활성화한다.
- 묶음 크기 20·50·100·200을 선택할 수 있게 하고 조회 범위나 묶음 크기가 바뀌면 첫 묶음으로 초기화하며 이전 요청을 취소한다.
- 로딩, 미수집, 빈 결과, 수집 중, 마지막 실행 실패·부분 완료, 조회 실패를 서로 구분해 표시한다.
- sample1과 필드·이름이 다른 단순 플러그인 fixture로 renderer 재사용을 검증하고 단위·브라우저 테스트를 CI 범위에 포함한다.
- 사용자 컬럼 설정, 이전 묶음 복귀, 임의 페이지 번호, 검색·필터·사용자 지정 정렬, 중첩 object·array 고급 표시와 사용자 정의 React 화면은 제외한다.

## Capabilities

### New Capabilities

- `plugin-record-list`: 검증된 플러그인 목록 정의와 플랫폼 저장 조회 API를 결합한 공통 React 목록, 상태 표시, cursor 기반 다음 묶음 이동 계약

### Modified Capabilities


## Impact

- `apps/web`: route placeholder가 공통 목록 컴포넌트로 교체되고 값 표시·페이지 상태·요청 생명주기 로직과 스타일이 추가된다.
- `apps/web/test`: 선언형 컬럼, scalar 표시, 상태 구분, cursor·묶음 크기 초기화, 요청 취소와 다른 플러그인 재사용 테스트가 추가된다.
- 기존 `/api/v1/plugin-menus`와 `/api/v1/records` 계약만 소비하며 서버 API와 플러그인 schema에는 변경이 없다.
- 클라이언트는 플랫폼의 동일 출처 `/api`만 호출하고 원천 API·DB·Connection 또는 큰 본문을 요청하지 않는다.
