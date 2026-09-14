## MODIFIED Requirements

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

## ADDED Requirements

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
