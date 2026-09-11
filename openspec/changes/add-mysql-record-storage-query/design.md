## Context

동기와 범위는 [proposal.md](proposal.md)를 따른다. 현재 `@oss-scp/platform-db`는 PostgreSQL·MySQL 연결과 제품별 migration runner를 제공하지만, 공통 레코드 schema와 `RecordStorage`·`RecordQuery` 구현은 PostgreSQL에만 있다. 수집 실행기와 API는 이미 공통 인터페이스를 소비하므로 MySQL 방언과 드라이버 값은 이 패키지 안에서 흡수해야 한다. 관찰 가능한 저장·조회 동작은 [platform-record-storage](specs/platform-record-storage/spec.md)와 [platform-record-query](specs/platform-record-query/spec.md)의 delta를 따른다.

## Goals / Non-Goals

**Goals:**

- MySQL 8.4에서 공통 레코드 저장, 관계, 실행, checkpoint, 격리 오류와 기본 목록·상세를 제공한다.
- 같은 fixture를 두 제품에 실행해 저장 결과와 cursor 경계가 동등함을 검증한다.
- DB 선택을 조립 경계 한 곳에 두고 수집·가공·업무 API에서 제품별 분기를 제거한다.

**Non-Goals:**

- PostgreSQL과 MySQL 사이의 기존 데이터 이전이나 schema 자동 변환을 제공하지 않는다.
- 검색·필터·사용자 지정 정렬 또는 원천 MySQL connector를 추가하지 않는다.
- 공통 SQL 생성기나 ORM을 새로 도입하지 않는다.

## Decisions

1. 공통 타입·입력 검증·cursor codec은 유지하고 `mysql-storage.ts`와 `mysql-query.ts`에 제품별 SQL을 둔다. PostgreSQL SQL을 공용 문자열 조립기로 추출하는 대안은 두 방언의 placeholder, upsert, JSON, 시간 및 오류 처리가 다시 조건문으로 섞이므로 채택하지 않는다. 두 구현은 작고 명시적인 상태로 유지하고 공통 계약 suite가 동등성을 보장한다.

2. MySQL migration은 PostgreSQL `0002`·`0003`과 같은 논리 schema를 제품별 디렉터리의 다음 migration들에 추가하되, 기존 운영 규칙대로 파일 하나에는 SQL statement 하나만 둔다. UUID는 공용 API와 cursor의 정렬 의미를 보존하기 위해 소문자 canonical UUID를 고정 길이 ASCII/binary collation 컬럼으로 저장한다. 시각은 세션 시간대를 UTC로 고정한 `DATETIME(3)`에 저장해 JavaScript ISO millisecond 정밀도와 일치시킨다. JSON은 MySQL JSON 컬럼에 저장하되 읽을 때 공통 `JsonValue`로 정규화한다.

3. MySQL의 기본 collation은 대소문자를 동일하게 취급할 수 있으므로 plugin/source/data type, 외부 문자열 키, UUID 및 관계 종류의 식별·정렬 컬럼은 binary collation을 명시한다. 최대 2,048자인 외부 키와 여러 범위 컬럼을 InnoDB의 단일 고유 인덱스에 직접 넣지 않고 canonical 범위·키의 길이 구분 직렬화로 SHA-256 identity digest를 계산해 고유 인덱스로 사용한다. 충돌 시 저장된 원문 범위·키를 반드시 비교하고, 일치하지 않으면 공개 `PERSIST_FAILED`로 묶음을 롤백하여 다른 레코드를 갱신하지 않는다. prefix index는 서로 다른 긴 키를 합칠 수 있어 사용하지 않는다.

4. MySQL upsert는 transaction 안에서 identity digest로 기존 행을 잠그고 원문 identity를 확인한 뒤, 없으면 애플리케이션에서 생성한 UUID로 삽입하고 있으면 `source_values`, `last_seen_at`, `updated_at`만 갱신한다. 이 방식은 `ON DUPLICATE KEY UPDATE`만으로 hash 충돌을 기존 레코드 갱신으로 오인하는 위험을 없애고 내부 ID·`first_seen_at`·후속 플랫폼 소유 테이블을 보존한다.

5. `commitBatch`는 전용 pool connection에서 transaction을 시작하고 실행 범위와 checkpoint 행을 잠근다. 레코드 upsert, 관계 endpoint 해석과 idempotent 저장, 격리 오류, 다음 checkpoint 및 실행 집계를 모두 성공한 뒤 commit한다. deadlock이나 드라이버 오류를 자동 재시도하지 않고 비밀정보 없는 공용 오류로 변환한다. 재호출은 이전 checkpoint에서 안전하게 같은 레코드를 갱신한다.

6. MySQL keyset 쿼리는 `(last_seen_at < ?) OR (last_seen_at = ? AND id > ?)`와 `ORDER BY last_seen_at DESC, id ASC`를 사용하며 scope와 정렬 컬럼을 포함한 복합 인덱스를 둔다. `id`의 binary collation과 `DATETIME(3)` 정밀도를 고정해 PostgreSQL cursor의 ISO timestamp/UUID 경계를 그대로 해석한다. 정확한 count는 계산하지 않고 기존처럼 `limit + 1`을 읽어 `hasNextPage`를 정한다.

7. 저장·조회 어댑터 선택은 연결 factory 선택 결과와 같은 DB type을 사용하는 조립 함수로 고정한다. API bootstrap과 수동 수집 CLI는 `postgres`일 때 PostgreSQL 구현, `mysql`일 때 MySQL 구현을 주입하고 이후 계층에는 `RecordStorage`·`RecordQuery`만 전달한다. 요청값이나 플러그인이 DB 제품을 고르게 하지 않는다.

8. 기존 PostgreSQL 테스트의 시나리오와 fixture를 제품 중립 계약 suite로 추출한다. 빠른 입력 검증 단위 테스트와 별도로 실제 PostgreSQL 17.6·MySQL 8.4.6에서 migration, 재수집, 관계 rollback, checkpoint 재개, 대소문자·긴 키·null·숫자·datetime·중첩 JSON, 동일 시각 20건 경계와 마지막 부분 묶음을 실행한다. CI의 DB별 job은 해당 실제 DB suite를 명시적으로 실행해 한 제품의 성공이 다른 제품 검증을 대신하지 않게 한다.

## Risks / Trade-offs

- [SHA-256 digest 충돌은 두 개의 서로 다른 긴 identity를 함께 저장하지 못하게 할 수 있음] → 원문 identity 비교로 잘못된 병합을 금지하고 충돌 시 전체 묶음을 안전하게 실패시킨다. digest 함수를 별도 단위로 검증하고 강제 충돌 fixture로 실패 경로를 확인한다.
- [MySQL과 PostgreSQL의 시간 정밀도·timezone 차이가 cursor 경계를 바꿀 수 있음] → 입력 시각을 ISO millisecond/UTC로 정규화하고 MySQL session timezone과 컬럼 정밀도를 고정하며 동일 시각 경계 fixture를 양쪽에 적용한다.
- [제품별 SQL이 중복됨] → 공통 인터페이스, 검증, 오류, fixture만 공유하고 방언별 SQL은 분리한다. 현재 두 제품 범위에서는 조건부 SQL 추상화보다 검토와 장애 격리가 쉽다.
- [MySQL transaction deadlock 또는 lock timeout] → 묶음 전체를 rollback하고 checkpoint를 전진시키지 않으며 안정된 오류를 반환한다. 자동 재시도 정책은 수집 실행 계약의 후속 결정으로 남긴다.

## Migration Plan

최신 PostgreSQL migration과 회귀 suite가 통과하는 상태에서 MySQL migration을 먼저 추가하고 빈 DB·재실행을 검증한다. 이후 MySQL 저장과 조회 구현 및 조립 선택을 추가하고 실제 두 DB 계약 suite를 통과시킨 뒤 문서와 CI를 갱신한다. 배포자는 `PLATFORM_DB_TYPE=mysql` 환경에서 기존과 같은 명시적 migration 명령을 API 시작 전에 실행한다.

코드 rollback은 MySQL 저장·조회 조립 등록을 제거해 해당 기능의 선택을 중단하는 방식으로 수행한다. 이미 적용된 전진 migration과 저장 데이터는 자동 삭제하지 않으며, 구버전 앱으로 되돌릴 때도 DB 백업과 호환 버전을 확인한다. 제품 간 자동 이전이나 down migration은 제공하지 않는다.
