## 1. Cursor와 공통 조회 계약

- [x] 1.1 공통 조회 입력·결과 타입을 `limit`, 선택 cursor와 `items/pageInfo`로 변경하고 기본 20 및 20·50·100·200 검증 테스트를 통과시킨다.
- [x] 1.2 버전·범위·limit·고정 정렬·마지막 키를 담는 cursor codec과 `INVALID_CURSOR` 오류를 구현하고 malformed·버전·범위·limit 불일치 단위 테스트를 통과시킨다.
- [x] 1.3 개별 필드 8 KiB, 레코드 요약 64 KiB와 items 전체 4 MiB 제한을 구현하고 결정적 omittedFields 및 다음 묶음 유지 테스트를 통과시킨다.

## 2. PostgreSQL keyset pagination

- [x] 2.1 목록 쿼리를 `lastSeenAt DESC, id ASC`의 limit+1 keyset 조건으로 변경하고 첫·중간·마지막·빈 묶음의 중복 없는 순회를 실제 PostgreSQL에서 검증한다.
- [x] 2.2 동일 시각 경계와 순회 중 삽입·갱신 동작, 범위 전체 lastStoredAt과 수집 상태 유지 및 query plan의 index 사용을 실제 PostgreSQL 테스트로 검증한다.

## 3. HTTP API와 문서

- [x] 3.1 NestJS API가 cursor를 전달하고 `items/pageInfo`를 반환하며 `INVALID_CURSOR`를 400으로 구분하는 서버 테스트를 통과시킨다.
- [x] 3.2 개발 계획과 조회 API 문서를 cursor 계약·제한·동시 변경 제약·후속 검색/필터/정렬 경계에 맞게 갱신한다.
- [x] 3.3 패키지와 전체 workspace lint·typecheck·test·build 및 `openspec validate add-record-cursor-pagination --strict`를 실행해 결과를 확인한다.
