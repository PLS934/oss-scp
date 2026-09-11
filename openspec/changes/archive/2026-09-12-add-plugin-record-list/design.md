## Context

`App.tsx`는 검증된 `/api/v1/plugin-menus` 응답으로 메뉴와 route context를 만들지만 각 route에는 placeholder만 렌더링한다. 메뉴 항목에는 scalar `list.columns`가 있고 `records.ts`는 동일 출처 저장 목록 API, cursor pageInfo, collection 상태, AbortSignal과 안전한 오류 결과를 이미 제공한다. 구현은 이 두 경계를 결합하며 서버·플러그인 schema를 변경하지 않는다.

## Goals / Non-Goals

**Goals:**

- 목록의 데이터 조회·상태 전이를 독립 컴포넌트에 캡슐화해 모든 단순 플러그인 route가 재사용한다.
- 응답의 `sourceValues` 중 검증된 기본 컬럼만 타입에 따라 안전하게 표시한다.
- 순방향 한 묶음 이동과 조건 변경 시 요청 취소를 경쟁 상태 없이 처리한다.
- DOM 기반 단위 테스트와 실제 브라우저 테스트에서 원천 API 호출이 없음을 검증한다.

**Non-Goals:**

- cursor 이력을 저장하는 이전 이동, 임의 페이지 번호, 행 상세 진입은 만들지 않는다.
- 검색·필터·사용자 정렬, 개인 컬럼 설정과 object·array 표시를 위한 확장 상태는 미리 설계하지 않는다.
- collection 상태를 갱신하기 위한 polling이나 수집 실행 동작을 추가하지 않는다.

## Decisions

### 목록을 route별 공통 컴포넌트로 분리한다

`App`은 메뉴·라우팅 책임을 유지하고 각 route에 `RecordList`와 해당 `MenuItem`을 전달한다. `RecordList`가 limit, cursor, 요청 결과와 오류를 소유한다. 별도 전역 store 대신 route에 귀속된 지역 상태를 사용하면 메뉴 전환 시 상태가 자연스럽게 격리되고 현재 범위에 필요하지 않은 캐시 정책을 만들지 않는다.

대안으로 `App`이 모든 조회 상태를 관리할 수 있으나 메뉴 로딩·health·routing 책임과 섞이고 상세 renderer 추가 시 더 커지므로 선택하지 않는다.

### 각 요청을 효과 단위 AbortController와 세대 번호로 보호한다

조회 범위·limit·cursor를 effect 의존성으로 삼아 요청마다 AbortController를 만들고 cleanup에서 취소한다. 취소를 무시하는 테스트 대역이나 이미 resolve된 promise도 현재 상태를 덮지 못하게 증가하는 request id를 함께 검사한다. 다음 버튼은 응답의 불투명 `nextCursor`만 상태에 복사하며 해석하지 않는다.

limit 변경은 cursor를 먼저 null로 바꾸고 새 첫 요청을 발생시킨다. 메뉴 전환은 route별 컴포넌트에 안정적인 scope key를 부여해 이전 인스턴스를 폐기한다. 이전 묶음은 지원하지 않으므로 cursor stack은 두지 않는다.

대안인 React Router loader나 데이터 조회 라이브러리는 현재 앱에 없는 의존성과 패턴을 도입하므로 이 범위에서는 사용하지 않는다.

### 표시 로직을 순수 함수로 제한한다

column type과 JSON 값을 받는 formatter는 string 타입 일치, 유한 number, boolean, 유효 datetime만 표시한다. number와 datetime은 `Intl.NumberFormat('ko-KR')`, `Intl.DateTimeFormat('ko-KR', ...)`로 형식화하고 boolean은 `예`/`아니요`, 나머지는 `—`를 반환한다. React가 값을 직접 객체 문자열로 변환하지 않으므로 비정상 값과 중첩 데이터가 노출되지 않는다.

대안인 범용 JSON renderer는 현재 scalar 계약과 제외 범위를 넘어가므로 추가하지 않는다.

### collection 상태 메시지와 데이터 영역을 독립적으로 합성한다

요청 자체의 loading/error와 성공 응답의 collection status를 분리한다. `running`, `partial`, `failed`는 상태 배너를 표시하되 items가 있으면 테이블도 렌더링한다. `never_collected`와 성공 빈 목록은 서로 다른 empty state가 된다. API 오류에는 `RecordApiError.message`만 사용하고 retry가 현재 cursor 요청을 다시 실행하도록 명시적 재시도 nonce를 둔다.

첫 로딩에서는 이전 scope의 행을 남기지 않는다. 같은 scope의 다음 묶음 로딩은 현재 표 대신 로딩 표시를 사용해 어느 묶음인지 혼동하지 않게 하며, 버튼을 비활성화해 중복 호출을 막는다.

### 검증은 컴포넌트 테스트와 브라우저 경로 테스트로 나눈다

순수 formatter와 요청 상태는 Vitest·React DOM 테스트에서 제어된 fetch로 검증한다. 브라우저 테스트는 플랫폼 `/api/v1/plugin-menus`와 `/api/v1/records`만 가로채 sample1 72건의 첫·다음 묶음, 다른 플러그인의 다른 컬럼, 직접 URL 접근을 확인하며 원천 mock API 패턴이 호출되면 실패시킨다. 기존 통합 CI의 웹 단위·브라우저 명령에 새 테스트가 자동 포함되는지 확인한다.

## Risks / Trade-offs

- [Intl 결과가 실행 환경별 구두점·공백에서 다를 수 있음] → 테스트는 의미 있는 날짜·숫자 부분과 접근 가능한 셀 텍스트를 검증하고 전체 locale 문자열을 스냅샷으로 고정하지 않는다.
- [빠른 route·limit 변경에서 오래된 응답이 화면을 덮을 수 있음] → AbortSignal과 request id를 함께 검사한다.
- [실패 상태에 저장된 행이 함께 오면 사용자가 최신 성공 데이터로 오해할 수 있음] → 상태 배너를 표보다 먼저 표시하고 마지막 실행 실패 또는 부분 완료임을 명시한다.
- [순방향 이동만 제공해 첫 묶음으로 즉시 돌아갈 수 없음] → #53의 의도된 범위로 문서화하고 이전 이동은 cursor 이력 정책과 함께 후속 작업으로 둔다.

## Migration Plan

기존 placeholder route를 공통 목록으로 교체하는 클라이언트 변경이며 데이터·API migration은 없다. 배포 전에 단위·브라우저 테스트와 production build를 통과시킨다. 문제 발생 시 목록 컴포넌트 연결 커밋을 되돌리면 기존 placeholder 화면으로 복구되며 서버와 저장 데이터에는 영향이 없다.
