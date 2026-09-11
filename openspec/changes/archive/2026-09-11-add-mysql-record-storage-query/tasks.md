## 1. MySQL 저장 schema와 식별 규칙

- [x] 1.1 PostgreSQL 공통 저장 migration과 cursor 인덱스를 MySQL 8.4 방언의 다음 versioned migration으로 추가하고, binary collation·JSON·UTC `DATETIME(3)`·foreign key·복합 cursor 인덱스를 실제 빈 MySQL에서 최초 적용 및 재실행해 검증한다.
- [x] 1.2 최대 길이 범위·외부 키의 canonical identity digest와 원문 일치 검사를 구현하고, 문자열/숫자 키 구분, 대소문자 구분, 2,048자 키 및 강제 digest 충돌이 잘못된 갱신 없이 실패하는 단위 테스트를 통과시킨다.

## 2. MySQL 공통 저장 구현

- [x] 2.1 MySQL `RecordStorage`의 실행 시작·종료와 checkpoint 조회를 구현하고, 상태 전이·전체 실행 재시작·실패 실행 재개 시나리오를 실제 MySQL 테스트로 검증한다.
- [x] 2.2 transaction과 행 잠금을 사용하는 레코드 upsert를 구현하고, 재수집 시 내부 ID·최초 관측 시각·플랫폼 소유 정보를 유지하면서 JSON과 최종 관측 시각만 갱신되는지 검증한다.
- [x] 2.3 관계 endpoint 해석·idempotent 관계 저장·격리 오류·실행 집계·checkpoint 갱신을 같은 transaction에 연결하고, endpoint 누락과 주입된 저장 실패에서 모든 변경과 checkpoint가 rollback되는지 검증한다.
- [x] 2.4 MySQL 드라이버·SQL·접속 정보가 공개 `StorageError`나 로그에 노출되지 않게 오류를 변환하고 단위 및 실제 DB 실패 테스트로 확인한다.

## 3. MySQL 기본 조회와 cursor pagination

- [x] 3.1 MySQL `RecordQuery`의 범위 목록, 상세, 최신 전체 수집 상태와 마지막 저장 시각 조회를 구현하고, 원천 중단 상태에서도 저장 결과만으로 응답하며 JSON null·숫자·문자열·중첩 값과 외부 키 타입이 보존되는지 검증한다.
- [x] 3.2 `last_seen_at DESC, id ASC` keyset 조건과 `limit + 1` 조회를 구현하고, 동일 시각 경계, 20·50·100·200건 크기, 마지막 부분 묶음 및 크기 제한으로 조기 종료한 묶음에서 중복·누락 없는 `nextCursor`와 `hasNextPage`를 검증한다.
- [x] 3.3 잘못된 입력은 쿼리 전에 거부하고 MySQL 조회 실패는 접속 정보 없는 공용 `QueryError`로 변환되는지 회귀 테스트를 추가한다.

## 4. 제품 중립 조립과 공통 계약 suite

- [x] 4.1 연결의 DB type에 맞는 `RecordStorage`·`RecordQuery` 조립 함수를 추가하고 API bootstrap과 수동 수집 CLI의 PostgreSQL 직접 분기를 교체해 가공·수집·업무 API 수정 없이 두 제품이 선택되는지 프로세스 테스트로 검증한다.
- [x] 4.2 기존 PostgreSQL 저장·조회 fixture를 제품 중립 계약 suite로 추출하고 PostgreSQL 17.6과 MySQL 8.4.6에 동일하게 실행해 범위·키·upsert·관계·rollback·checkpoint·상태·상세 계약을 비교한다.
- [x] 4.3 두 실제 DB에 동일 시각·UUID 경계와 대소문자·긴 문자열·null·datetime·숫자·중첩 JSON fixture를 저장한 뒤 전체 cursor 순서와 각 묶음 경계·`hasNextPage`가 동등한지 검증한다.
- [x] 4.4 sample1 수집·가공·저장·재실행·실패 재개·원천 독립 조회 통합 경로를 MySQL에서도 실행하고 기존 PostgreSQL 통합 테스트 결과와 같은 의미의 결과를 확인한다.

## 5. CI·문서와 전체 검증

- [x] 5.1 MySQL CI job이 migration뿐 아니라 실제 저장·조회 계약과 sample 통합 검증을 명시적으로 실행하고 PostgreSQL job도 유지하도록 workflow를 갱신한 뒤 정적 설정 검사로 두 job의 명령을 확인한다.
- [x] 5.2 플랫폼 DB와 레코드 조회 문서에 MySQL migration·인덱스·binary collation·UTC 정밀도·digest 충돌 실패·지원 버전·제품 간 이전 제외 범위를 기록하고 실제 명령 및 설정과 대조한다.
- [x] 5.3 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, PostgreSQL/MySQL 실제 계약 및 sample 통합 테스트와 `openspec validate add-mysql-record-storage-query --strict`를 깨끗한 환경에서 실행해 완료 조건을 확인한다.
