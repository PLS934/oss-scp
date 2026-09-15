# Platform Record Query Specification

## Purpose

원천 시스템의 가용성과 무관하게 플랫폼 DB에 저장된 공통 레코드의 제한된 목록·상세와 관련 수집 상태를 DB 제품에 종속되지 않은 계약으로 조회하게 한다.

## Requirements

### Requirement: Stored record lists are bounded and stably ordered
플랫폼은 plugin ID, source ID와 data type이 모두 지정된 범위에서 저장 레코드 목록을 SHALL 반환해야 한다. 묶음 크기는 20·50·100·200 중 하나이고 기본값은 20이어야 한다. 첫 묶음과 후속 묶음은 `lastSeenAt` 내림차순과 내부 `id` 오름차순의 동일한 안정적 순서를 사용해야 하며 cursor 모드에서는 정확한 전체 건수를 계산해서는 안 된다. `page`가 지정된 번호형 모드에서는 동일 범위의 정확한 전체 건수를 제공해야 한다.

#### Scenario: Default bounded list
- **WHEN** 조회자가 유효한 범위와 cursor 없이 크기를 지정하지 않고 목록을 조회한다
- **THEN** 플랫폼은 고정된 순서의 첫 20건 이하와 다음 묶음 존재 여부를 반환한다

#### Scenario: Requested list is capped
- **WHEN** 조회자가 20·50·100·200 중 하나를 지정한다
- **THEN** 플랫폼은 지정한 수 이하의 레코드를 반환한다

#### Scenario: Invalid list input is rejected
- **WHEN** 필수 범위가 비어 있거나 목록 크기가 허용 집합에 없거나 cursor가 잘못되었다
- **THEN** 플랫폼은 조회를 실행하지 않고 안정된 잘못된 입력 오류를 반환한다

### Requirement: List summaries exclude large source content
플랫폼은 목록 레코드마다 내부 ID, 범위 식별자, 타입이 보존된 외부 키, 최초·최종 관측 시각과 제한된 원천 값 요약을 SHALL 반환해야 한다. 직렬화된 개별 최상위 원천 값이 8 KiB를 초과하면 해당 필드를 제외하고 이름을 `omittedFields`에 표시해야 하며, 한 레코드 요약과 한 응답의 전체 크기도 제한해야 한다. 상세 조회에서는 저장된 전체 원천 값을 반환해야 한다.

#### Scenario: Large field is omitted from a list
- **WHEN** 저장 레코드의 최상위 원천 필드 하나가 직렬화 기준 8 KiB를 초과하거나 요약 크기 한도를 넘긴다
- **THEN** 목록 요약은 해당 필드를 제외하고 `omittedFields`에 그 필드 이름을 포함한다

#### Scenario: Page response remains bounded
- **WHEN** cursor 모드에서 요청한 묶음의 요약 데이터가 전체 응답 크기 한도를 넘긴다
- **THEN** 플랫폼은 한도 안의 레코드만 반환하고 다음 cursor와 `hasNextPage=true`를 제공한다

#### Scenario: Detail retains stored content
- **WHEN** 조회자가 목록에서 필드가 제외된 레코드의 내부 ID로 상세를 조회한다
- **THEN** 플랫폼은 저장 한도 안에서 영속화된 전체 원천 값을 반환한다

### Requirement: Record details use platform identity
플랫폼은 유효한 내부 UUID로 저장된 레코드 상세를 SHALL 조회해야 하며, DB 제품별 타입이나 드라이버 값을 공개 계약에 노출해서는 안 된다.

#### Scenario: Existing detail is returned
- **WHEN** 조회자가 존재하는 레코드의 내부 UUID로 상세를 조회한다
- **THEN** 플랫폼은 그 레코드의 범위, 외부 키, 전체 원천 값과 관측 시각을 반환한다

#### Scenario: Missing detail is distinguished
- **WHEN** 유효한 내부 UUID에 해당하는 저장 레코드가 없다
- **THEN** 플랫폼은 명시적인 찾을 수 없음 결과를 반환한다

#### Scenario: Malformed identity is rejected
- **WHEN** 상세 식별자가 UUID 형식이 아니다
- **THEN** 플랫폼은 DB 쿼리를 실행하지 않고 안정된 잘못된 입력 오류를 반환한다

### Requirement: Query responses distinguish collection state
범위 목록 조회는 같은 plugin ID와 source ID의 가장 최근 전체 수집 실행을 기준으로 `never_collected`, `running`, `success`, `partial`, `failed` 상태를 SHALL 구분해야 한다. 상태에는 실행 식별자와 시작·종료 시각을 가능한 경우 포함하고, 목록의 마지막 저장 시각은 반환된 묶음이 아니라 해당 조회 범위 전체의 가장 최근 `lastSeenAt`으로 제공해야 한다.

#### Scenario: No collection has run
- **WHEN** 범위에 해당하는 전체 수집 실행 이력이 없다
- **THEN** 플랫폼은 `never_collected` 상태와 null 실행·시각 정보를 반환한다

#### Scenario: Running collection preserves stored results
- **WHEN** 가장 최근 전체 수집이 실행 중이고 이전에 저장된 레코드가 있다
- **THEN** 플랫폼은 `running` 상태와 기존 저장 목록 및 범위의 마지막 저장 시각을 함께 반환한다

#### Scenario: Failed or partial collection is explicit
- **WHEN** 가장 최근 전체 수집이 `failed` 또는 `partial`로 끝났다
- **THEN** 플랫폼은 해당 상태를 성공이나 빈 결과로 바꾸지 않고 그대로 반환한다

### Requirement: PostgreSQL reads only platform storage
PostgreSQL 구현은 공통 조회 계약을 SHALL 구현하고 조회 중 외부 원천 API·DB·파일을 호출해서는 안 된다. cursor 목록은 offset 없이 마지막 `lastSeenAt/id`를 기준으로 다음 묶음을 읽어야 한다.

#### Scenario: Source outage does not prevent a query
- **WHEN** 원천 서비스가 중단되었지만 저장된 레코드와 수집 실행 이력이 PostgreSQL에 있다
- **THEN** 목록과 상세 조회는 PostgreSQL의 저장 결과만으로 성공하며 원천 호출을 발생시키지 않는다

#### Scenario: Cursor continues without duplicate boundary record
- **WHEN** 조회자가 이전 응답의 cursor로 다음 묶음을 요청한다
- **THEN** PostgreSQL은 이전 마지막 레코드 뒤부터 읽고 경계 레코드를 중복 반환하지 않는다

#### Scenario: Persistence failure is sanitized
- **WHEN** PostgreSQL 조회가 실패한다
- **THEN** 플랫폼은 드라이버 메시지나 접속 정보를 노출하지 않는 안정된 조회 실패 오류를 반환한다

### Requirement: MySQL reads platform storage with the common query semantics
MySQL 조회 구현은 PostgreSQL과 동일한 공통 목록·상세·수집 상태 계약을 SHALL 구현하고 외부 원천을 호출해서는 안 된다. cursor 목록은 `lastSeenAt` 내림차순과 내부 `id` 오름차순으로 정렬하며 offset 없이 두 값의 keyset 경계로 다음 묶음을 읽어야 한다.

#### Scenario: Source outage does not prevent a MySQL query
- **WHEN** 원천 서비스가 중단되었지만 저장된 레코드와 수집 실행 이력이 MySQL에 있다
- **THEN** 목록과 상세 조회는 MySQL의 저장 결과만으로 성공하며 원천 호출을 발생시키지 않는다

#### Scenario: MySQL cursor continues without duplicate boundary record
- **WHEN** 조회자가 MySQL에서 받은 이전 응답의 cursor로 다음 묶음을 요청한다
- **THEN** MySQL은 이전 마지막 레코드 뒤부터 읽고 경계 레코드를 중복 반환하지 않는다

#### Scenario: MySQL query failure is sanitized
- **WHEN** MySQL 조회가 실패한다
- **THEN** 플랫폼은 드라이버 메시지나 접속 정보를 노출하지 않는 안정된 조회 실패 오류를 반환한다

### Requirement: PostgreSQL and MySQL pagination have equivalent boundaries
플랫폼은 동일 fixture와 동일 cursor 요청에 대해 PostgreSQL과 MySQL에서 같은 정렬·경계·`hasNextPage` 의미를 SHALL 제공해야 한다. datetime은 공통 정밀도로 비교하고 내부 ID와 문자열은 locale 또는 기본 collation에 영향받지 않는 이진 순서를 사용해야 한다.

#### Scenario: Equal timestamps use deterministic identity order
- **WHEN** 여러 레코드가 동일한 `lastSeenAt` 값을 가지고 한 묶음 경계를 가로지른다
- **THEN** 두 DB 구현은 내부 `id` 오름차순으로 같은 순서를 만들고 후속 묶음에 중복이나 누락을 만들지 않는다

#### Scenario: Final partial page is equivalent
- **WHEN** 남은 레코드 수가 요청 크기보다 작은 마지막 묶음을 두 DB에서 조회한다
- **THEN** 두 구현은 같은 의미의 남은 레코드를 반환하고 `hasNextPage=false`와 `nextCursor=null`을 제공한다

#### Scenario: String and null source values do not alter cursor order
- **WHEN** 원천 값에 대소문자가 다른 문자열, null, datetime, 숫자와 중첩 JSON이 혼합되어 있다
- **THEN** 두 구현은 원천 값의 DB별 비교나 표현에 cursor 순서를 의존하지 않고 같은 저장 값을 반환한다

### Requirement: Numbered pages provide exact scoped totals
플랫폼은 `page`를 지정하면 1부터 시작하는 번호형 조회를 SHALL 제공하고, `limit`은 기존 20·50·100·200 및 기본값 20을 사용해야 한다. 번호형 `pageInfo`는 `page`, `pageSize`, `totalItems`, `totalPages`, `hasNextPage`를 포함해야 하며 cursor 모드와 구분되도록 `nextCursor`를 포함하지 않아야 한다. 전체 건수와 items는 하나의 읽기 snapshot에서 동일 범위를 기준으로 조회해야 한다. 두 DB의 정렬은 기존 `lastSeenAt DESC, id ASC`를 유지해야 한다. page와 offset은 안전한 정수 범위여야 하며 cursor와 page의 동시 지정은 입력 오류여야 한다.

#### Scenario: Direct numbered query
- **WHEN** 45건 범위에서 page=2, limit=20을 조회한다
- **THEN** 정렬상 21~40번째 레코드와 page=2, pageSize=20, totalItems=45, totalPages=3, hasNextPage=true를 반환한다

#### Scenario: Empty range and deleted last page
- **WHEN** 범위가 비었거나 요청한 페이지가 현재 마지막 페이지를 초과한다
- **THEN** 빈 범위는 page=1, totalItems=0, totalPages=0, items=[], hasNextPage=false이며 비어 있지 않은 초과 요청은 마지막 유효 페이지로 보정하여 그 items와 메타데이터를 반환한다

#### Scenario: Invalid numbered request
- **WHEN** page가 0·음수·소수·안전 정수 범위 밖이거나 offset이 안전 정수 범위를 벗어나거나 cursor와 함께 전달된다
- **THEN** DB 조회 전에 INVALID_QUERY 오류를 반환한다

#### Scenario: Large summaries retain numbered boundaries
- **WHEN** 번호형 페이지의 요약이 기존 4 MiB items 예산을 초과한다
- **THEN** 레코드를 버리지 않고 원천 요약 필드를 추가로 생략하여 모든 페이지 레코드의 내부 ID와 omittedFields를 유지하며 예산을 만족시킨다. 최소 식별·생략 메타데이터만으로도 예산을 넘으면 QUERY_FAILED를 반환하고 불완전한 성공 페이지를 반환하지 않는다

#### Scenario: Concurrent collection and database equivalence
- **WHEN** 동일 fixture의 동률 시각·마지막 페이지·크기 변경을 두 DB에서 조회하거나 조회 중 수집이 데이터를 갱신한다
- **THEN** 같은 snapshot의 count와 페이지 경계를 보장하고 두 DB가 동일 정렬·메타데이터 의미를 제공한다. 서로 다른 요청 사이 변경은 중복·누락을 일으킬 수 있으며 고정 snapshot 탐색을 보장하지 않는다

### Requirement: 허용된 scalar 값을 양쪽 DB에서 동일하게 정렬한다
사용자 지정 정렬은 번호형 page 조회에만 적용하며 cursor 조회는 기존 고정 keyset 순서를 SHALL 유지해야 한다.
플랫폼 DB는 검증된 단일 string, number, boolean, datetime 정렬을 검색·필터 이후와 페이지 분할 이전에 SHALL 적용해야 한다. 유효한 값은 요청 방향으로 정렬하고 null·타입 불일치·잘못된 값은 방향과 무관하게 뒤에 배치해야 한다. 문자열은 검색의 ASCII 비교 계약과 같은 결정적 비교를 사용하고, 같은 값은 `lastSeenAt DESC, id ASC`로 안정화해야 한다. 정렬이 없으면 기존 `lastSeenAt DESC, id ASC`를 유지해야 한다.

#### Scenario: 타입별 오름차순과 내림차순
- **WHEN** string, number, boolean 또는 datetime 정렬로 같은 fixture를 조회한다
- **THEN** PostgreSQL과 MySQL은 유효값, null·잘못된 값, 동일값 경계를 포함해 같은 순서를 반환한다

#### Scenario: 번호형 페이지 경계
- **WHEN** 정렬값이 같은 레코드가 페이지 경계에 걸쳐 있다
- **THEN** 안정화 정렬로 중복·누락 없이 결정적인 번호형 페이지 결과를 제공한다

#### Scenario: 정렬 없는 호환 조회
- **WHEN** 정렬 조건 없이 기존 목록을 조회한다
- **THEN** 기존 저장 시각 내림차순과 내부 ID 오름차순 결과를 유지한다
