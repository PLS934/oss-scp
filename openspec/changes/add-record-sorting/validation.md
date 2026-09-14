# 구현 및 검증 기록

- 변경: `add-record-sorting`
- 브랜치: `codex/issue-104-search-filters`
- 실제 DB: PostgreSQL 17.6, MySQL 8.4.6

## 구현 결과

최상위 scalar 목록 필드에 선택적 `sortable: true`를 추가하고 검증된 메뉴의 `list.sorts`에는 key·label·type만 공개했다. 번호형 records API는 허용된 `sort`와 `direction=asc|desc` 한 쌍을 검증해 양쪽 DB에 전달한다. 미허용·중복·부분 값과 cursor 결합은 DB 접근 전에 거부하며 정렬 없는 기존 요청과 cursor의 고정 정렬은 유지한다.

전체 건수 옆에는 선언 순서의 정렬 뱃지를 표시한다. 같은 뱃지는 오름차순→내림차순→해제로 순환하고 다른 뱃지는 기존 정렬을 해제한 뒤 새 필드 오름차순으로 교체한다. 정렬 변경은 검색·필터·페이지 크기를 유지하며 첫 페이지를 즉시 조회하고 요청 경합에서는 최신 결과만 표시한다.

## 검증 결과

- `pnpm test`: 전체 workspace 통과. 웹 126개, plugin-config 92개, platform-db 179개, API 45개를 포함한다.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: 통과.
- `node scripts/test-record-search.mjs`: 취약점 string·number·boolean·datetime asc/desc, 뱃지 순환·다른 필드 교체, 검색·필터 조합, 첫 페이지 이동·응답 경합과 서버 자산 72건·저장소 153건을 PostgreSQL·MySQL에서 통과했다.
- 1,000건 fixture에서 검색·필터 조회는 PostgreSQL 2.33ms, MySQL 4.67ms였고 점수 내림차순 결합 조회는 PostgreSQL 3.70ms, MySQL 11.66ms였다. 생성된 `test-results/record-search-both.json`에 정렬 EXPLAIN을 기록했다. 로컬 단일 실행 결과이며 운영 성능 보장이 아니다.
- 라이트·다크 및 390px 모바일 화면에서 정렬 뱃지와 필터 팝오버 배치를 확인했다.
- `openspec validate add-record-sorting --strict`, `git diff --check`: 통과.

## 미검증 범위

원격 GitHub Actions와 Docker 제품 이미지 검증은 실행하지 않았다. 정렬 전용 index는 추가하지 않았으며 운영 데이터 규모에서는 실제 쿼리와 사용 필드를 기준으로 재측정해야 한다.
