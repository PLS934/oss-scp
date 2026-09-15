## 1. 플러그인 선언과 메뉴 계약

- [x] 1.1 scalar 필드의 `sortable: true` 타입·검증을 구현하고 생략 호환성, false·타입 불일치·중첩·목록 밖 선언 거부를 plugin-config 테스트로 확인한다.
- [x] 1.2 런타임 메뉴에 선언 순서의 key·label·type만 포함한 정렬 메타데이터를 추가하고 기존 columns·query 형식 및 비밀정보 제외를 메뉴 테스트로 확인한다.
- [x] 1.3 취약점·서버 자산·저장소 샘플 플러그인의 유용한 scalar 목록 필드에 정렬을 선언하고 전체 플러그인 preflight 테스트를 통과시킨다.

## 2. API와 공통 조회 모델

- [x] 2.1 클라이언트 목록 입력에 단일 sort·direction 타입과 직렬화를 추가하고 정상 조합, 한쪽 누락, 잘못된 방향, 정렬 없는 기존 URL을 테스트한다.
- [x] 2.2 records API가 registry 정렬 선언을 해석해 번호형 요청만 허용하고 미허용·중복·부분 값과 cursor 결합을 DB 접근 전 INVALID_QUERY로 거부하는 controller/service 테스트를 통과시킨다.
- [x] 2.3 공통 플랫폼 DB 입력에 검증된 scalar 정렬 모델을 추가하고 사용자 문자열이 SQL 조각이 되지 않도록 타입·방향을 제한하는 단위 테스트를 작성한다.

## 3. PostgreSQL·MySQL 정렬

- [x] 3.1 PostgreSQL 번호형 목록 SQL에 타입 guard, invalid-last, 요청 방향, lastSeenAt/id 안정화 정렬을 적용하고 string·number·boolean·datetime·null·잘못된 값·동일값 경계를 실제 DB 테스트로 확인한다.
- [x] 3.2 MySQL에 같은 정렬 계약을 구현하고 공통 fixture의 asc·desc·검색·필터 조합 및 페이지 경계 결과가 PostgreSQL과 일치함을 확인한다.
- [x] 3.3 정렬 없는 cursor·번호형 조회의 기존 고정 순서 회귀 테스트를 통과시키고 대표 정렬 쿼리의 양쪽 DB EXPLAIN·소요 시간을 기록한다.

## 4. 정렬 뱃지 UI

- [x] 4.1 목록 세션에 nullable 단일 정렬 상태를 추가하고 같은 뱃지의 asc→desc→해제, 다른 뱃지의 기존 정렬 해제와 새 asc 적용을 상태 테스트로 확인한다.
- [x] 4.2 전체 건수 옆에 선언 순서의 정렬 뱃지를 렌더링하고 활성 방향 아이콘·aria-label·aria-pressed, 미선언 컬럼 미표시와 라이트·다크·모바일 배치를 화면 테스트로 확인한다.
- [x] 4.3 정렬 변경이 현재 검색·필터·페이지 크기를 유지하며 첫 페이지를 즉시 조회하고 메뉴 변경 초기화, 로딩 중 이전 결과 제거, 늦은 응답 무시와 재시도를 브라우저 테스트로 확인한다.

## 5. 통합 검증과 문서

- [x] 5.1 기존 수집 데이터와 양쪽 실제 DB에서 취약점·서버 자산·저장소의 정렬 뱃지 순환, 다른 필드 교체, 필터·검색 결합 및 페이지 경계를 표→API→DB 시나리오로 검증한다.
- [x] 5.2 plugin-development, client-development, server-development와 record-query API 문서를 정렬 선언·파라미터·비교·null·번호형 전용·제한 계약에 맞게 갱신한다.
- [x] 5.3 관련 workspace 테스트, typecheck, lint, build, OpenSpec strict와 git diff 검사를 실행하고 결과·성능·미검증 범위를 validation 기록에 남긴다.
