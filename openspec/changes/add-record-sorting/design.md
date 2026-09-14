## Context

동기는 proposal.md를 따른다. 현재 플러그인 scalar 필드는 검색·필터 여부를 선언하고 런타임 메뉴가 최소 query 메타데이터를 제공한다. 번호형 목록은 검색·필터 조건을 SQL WHERE에 적용한 뒤 `lastSeenAt DESC, id ASC` 고정 순서로 count와 LIMIT/OFFSET을 같은 읽기 전용 snapshot에서 조회한다. React 목록 상태는 조건·페이지 크기를 sessionKey에 넣고 AbortController와 요청 번호로 오래된 응답을 배제한다.

## Goals / Non-Goals

**Goals:** 플러그인이 허용한 최상위 scalar 목록 필드를 한 번에 하나 정렬한다. PostgreSQL·MySQL의 타입, null, 잘못된 값과 동일값 순서를 맞춘다. 검색·필터·번호형 페이지와 결합하고 기존 무정렬 호출을 호환한다.

**Non-Goals:** 다중 정렬, 개인 설정 저장, object·array 또는 중첩 경로, locale 자연어 정렬, 정렬별 index 생성, 임의 정렬의 cursor keyset 지원은 포함하지 않는다.

## Decisions

1. **필드 선언은 `sortable: true`만 허용한다.** 기존 `searchable`처럼 생략을 비활성으로 두고 목록에 공개된 최상위 scalar 필드만 허용한다. 별도 정렬 설정 객체는 향후 null 위치나 collation 옵션을 약속하므로 현재 요구보다 넓다. 런타임 메뉴에는 `list.sorts`로 key·label·type만 전달해 서버 전용 schema를 노출하지 않는다.

2. **API는 `sort`와 `direction`의 단일 쌍을 사용한다.** JSON 배열은 다중 정렬 가능성을 암시하고 파싱 복잡도를 늘린다. 두 값은 함께 있어야 하고 registry의 현재 데이터 종류·목록 선언에 대해 검증한다. 사용자 정렬은 현재 UI가 사용하는 번호형 `page` 요청에서만 허용하고 cursor와 함께 오거나 page 없이 오면 INVALID_QUERY로 거부한다. cursor 모드는 기존 고정 keyset 계약을 유지한다.

3. **정렬 상태는 목록 세션의 단일 nullable 값이다.** `{ field, direction } | null`을 검색·필터 조건과 함께 sessionKey에 넣는다. 같은 필드 클릭은 null→asc→desc→null로 순환하고 다른 필드 클릭은 즉시 새 필드 asc로 교체한다. 변경은 페이지 1을 요청하며 검색·필터 입력은 유지한다. 메뉴 변경은 상태를 새 세션으로 초기화한다.

4. **뱃지는 전체 건수 바로 뒤에 선언 순서로 표시한다.** 비활성 뱃지도 보여 정렬 가능 필드를 발견할 수 있게 하고 활성 뱃지에는 방향 아이콘과 `aria-pressed`, 방향을 포함한 접근성 이름을 제공한다. 컬럼 헤더는 필터 팝오버 전용으로 유지해 클릭 의미 충돌을 피한다.

5. **SQL은 타입별 안전 표현식과 유효성 rank를 정렬한다.** JSON 값이 선언 타입에 맞는지 먼저 판별하고 `invalidRank ASC`, 타입별 값 요청 방향, `last_seen_at DESC`, `id ASC` 순으로 ORDER BY를 만든다. invalidRank는 null·타입 불일치·잘못된 datetime을 항상 마지막에 둔다. 문자열은 검색 계약과 같은 ASCII 접기 후 결정적 binary 비교를 사용하고 원문 binary 값으로 한 번 더 안정화한다. SQL 조각은 검증된 타입·방향 템플릿에서만 선택하며 사용자 문자열을 붙이지 않는다.

6. **count는 정렬과 무관하고 목록 SQL만 동적 ORDER BY를 사용한다.** 번호형 count와 items는 기존 REPEATABLE READ 읽기 전용 transaction을 유지한다. 정렬 변경 시 기존 결과를 숨기고 새 응답만 표시하는 현재 요청 경합 패턴을 재사용한다. 정렬별 전용 index는 만들지 않으므로 대표 fixture의 EXPLAIN과 소요 시간을 양쪽 DB에서 기록한다.

7. **예시 플러그인은 실제 목록에서 유용한 scalar 필드만 정렬 가능으로 선언한다.** 취약점의 이름·점수·영향 여부·관측 시각과 자산의 대표 이름·상태·시각 등 각 플러그인의 기존 필드를 사용한다. 정렬 값은 이미 수집된 sourceValues를 읽으며 외부 원천이나 담당자 데이터를 변경하지 않는다.

## Risks / Trade-offs

- [JSON 계산 정렬은 큰 범위에서 filesort와 비용 증가를 일으킬 수 있음] → 선언된 필드만 허용하고 limit·응답 한도를 유지하며 양쪽 DB EXPLAIN을 기록한다. 운영 규모 측정 후 필요한 필드에 별도 index 설계를 추가한다.
- [DB별 문자열·datetime 변환 차이가 결과를 갈라놓을 수 있음] → 타입 guard, UTC epoch, ASCII 접기와 binary tie-break를 공통 fixture로 검증한다.
- [수집 중 서로 다른 페이지 요청 사이 위치가 변할 수 있음] → 한 요청의 count/items snapshot만 보장한다는 번호형 페이지 기존 계약을 유지한다.
- [활성 정렬 표시가 색상만으로 전달될 수 있음] → 방향 아이콘, 텍스트 기반 aria-label과 aria-pressed를 함께 제공한다.

## Migration Plan

저장 schema migration 없이 플러그인 설정·메뉴·API·DB·웹을 함께 배포한다. 기존 플러그인은 `sortable`을 생략해 고정 정렬을 유지하고 기존 API 호출도 변하지 않는다. 롤백은 정렬 선언과 sort 파라미터 생성 코드를 제거하면 되며 저장 데이터 변환은 필요 없다.
