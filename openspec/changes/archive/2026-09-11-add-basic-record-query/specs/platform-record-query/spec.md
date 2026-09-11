## Purpose

원천 시스템의 가용성과 무관하게 플랫폼 DB에 저장된 공통 레코드의 제한된 목록·상세와 관련 수집 상태를 DB 제품에 종속되지 않은 계약으로 조회하게 한다.

## ADDED Requirements

### Requirement: Stored record lists are bounded and stably ordered
플랫폼은 plugin ID, source ID와 data type이 모두 지정된 범위에서 저장 레코드 목록을 SHALL 반환해야 한다. 목록 크기는 기본 50건, 최대 200건이어야 하며 `lastSeenAt` 내림차순과 내부 `id` 오름차순의 고정된 순서로 반환해야 한다.

#### Scenario: Default bounded list
- **WHEN** 조회자가 유효한 plugin ID, source ID와 data type으로 크기를 지정하지 않고 목록을 조회한다
- **THEN** 플랫폼은 최대 50건을 고정된 순서로 반환한다

#### Scenario: Requested list is capped
- **WHEN** 조회자가 1부터 200까지의 정수 크기를 지정한다
- **THEN** 플랫폼은 요청한 수 이하의 레코드를 반환한다

#### Scenario: Invalid list input is rejected
- **WHEN** 필수 범위가 비어 있거나 목록 크기가 정수 1부터 200 범위를 벗어난다
- **THEN** 플랫폼은 조회를 실행하지 않고 안정된 잘못된 입력 오류를 반환한다

### Requirement: List summaries exclude large source content
플랫폼은 목록 레코드마다 내부 ID, 범위 식별자, 타입이 보존된 외부 키, 최초·최종 관측 시각과 제한된 원천 값 요약을 SHALL 반환해야 한다. 직렬화된 개별 최상위 원천 값이 8 KiB를 초과하면 목록에서 해당 필드를 제외하고 필드 이름을 `omittedFields`에 표시해야 하며, 상세 조회에서는 저장된 전체 원천 값을 반환해야 한다.

#### Scenario: Large field is omitted from a list
- **WHEN** 저장 레코드의 최상위 원천 필드 하나가 직렬화 기준 8 KiB를 초과한다
- **THEN** 목록 요약은 해당 필드를 원천 값에서 제외하고 `omittedFields`에 그 필드 이름을 포함한다

#### Scenario: Detail retains stored content
- **WHEN** 조회자가 목록에서 큰 필드가 제외된 레코드의 내부 ID로 상세를 조회한다
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
범위 목록 조회는 같은 plugin ID와 source ID의 가장 최근 전체 수집 실행을 기준으로 `never_collected`, `running`, `success`, `partial`, `failed` 상태를 SHALL 구분해야 한다. 상태에는 실행 식별자와 시작·종료 시각을 가능한 경우 포함하고, 목록의 마지막 저장 시각은 반환된 상태와 별도로 해당 범위에 저장된 레코드의 가장 최근 `lastSeenAt`으로 제공해야 한다.

#### Scenario: No collection has run
- **WHEN** 범위에 해당하는 전체 수집 실행 이력이 없다
- **THEN** 플랫폼은 `never_collected` 상태와 null 실행·시각 정보를 반환한다

#### Scenario: Running collection preserves stored results
- **WHEN** 가장 최근 전체 수집이 실행 중이고 이전에 저장된 레코드가 있다
- **THEN** 플랫폼은 `running` 상태와 기존 저장 목록 및 마지막 저장 시각을 함께 반환한다

#### Scenario: Failed or partial collection is explicit
- **WHEN** 가장 최근 전체 수집이 `failed` 또는 `partial`로 끝났다
- **THEN** 플랫폼은 해당 상태를 성공이나 빈 결과로 바꾸지 않고 그대로 반환한다

### Requirement: PostgreSQL reads only platform storage
PostgreSQL 구현은 공통 조회 계약을 SHALL 구현하고 조회 중 외부 원천 API·DB·파일을 호출해서는 안 된다.

#### Scenario: Source outage does not prevent a query
- **WHEN** 원천 서비스가 중단되었지만 저장된 레코드와 수집 실행 이력이 PostgreSQL에 있다
- **THEN** 목록과 상세 조회는 PostgreSQL의 저장 결과만으로 성공하며 원천 호출을 발생시키지 않는다

#### Scenario: Persistence failure is sanitized
- **WHEN** PostgreSQL 조회가 실패한다
- **THEN** 플랫폼은 드라이버 메시지나 접속 정보를 노출하지 않는 안정된 조회 실패 오류를 반환한다
