## Context

동기는 [proposal.md](./proposal.md)를 따른다. 최신 `platform-db`에는 공통 `RecordStorage`와 PostgreSQL 저장 구현, `platform_records` 및 `collection_runs`가 있지만 읽기 계약은 없다. NestJS API는 등록 가능한 플랫폼 DB 연결을 사용해 health/readiness만 제공한다. 조회는 플랫폼 DB만 읽어야 하며 현재 계정관리는 비활성화 상태다.

## Goals / Non-Goals

**Goals:**

- 저장 adapter와 같은 패키지에 DB 비종속 조회 계약을 두어 후속 MySQL 구현과 권한 서비스가 재사용할 경계를 만든다.
- 제한된 목록·상세와 최신 전체 수집 상태를 한 요청에서 일관된 공개 타입으로 제공한다.
- API가 조회 오류를 안정된 HTTP 응답으로 바꾸고 원천 장애와 독립적으로 동작하게 한다.

**Non-Goals:**

- cursor/offset 페이징, 전체 건수, 검색·필터·사용자 정렬과 필드 정의 기반 projection
- 자산별 수집 상태 병합, 관계 조회, 담당자·감사 및 보관 상태
- 인증·권한 구현과 MySQL 조회 adapter

## Decisions

### 공통 `RecordQuery` 계약을 저장 쓰기 계약과 분리한다

`platform-db`에 목록 입력, 요약·상세 레코드, 수집 상태와 `QueryError`를 정의한다. 읽기와 쓰기를 하나의 repository 인터페이스로 합치면 조회 전용 소비자가 수집 변경 메서드에도 의존하므로 별도 계약을 사용한다. API 서비스는 이 계약만 주입받아 후속 권한 검사를 adapter 밖에서 적용할 수 있게 한다.

### 목록 범위와 순서를 작게 고정한다

목록은 `pluginId + sourceId + dataType`을 필수 범위로 받고 기본 50건, 최대 200건을 `last_seen_at DESC, id ASC`로 정렬한다. 초기 API에 pagination token을 추가하는 대안은 다음 페이지의 snapshot 일관성 계약이 필요해 제외한다. 전체 건수도 별도 count 비용과 후속 권한 범위를 아직 정의하지 않아 반환하지 않는다.

### 목록의 큰 값은 최상위 필드 단위로 제외한다

목록에서는 각 `source_values`의 최상위 값을 JSON 직렬화해 8 KiB를 초과한 필드를 제외하고 정렬된 `omittedFields`를 함께 반환한다. 필드 이름이나 추정 의미로 본문을 판별하는 방식은 플러그인마다 달라 제외했다. 레코드 전체를 목록에서 숨기면 기본 목록의 유용성이 떨어지므로 작은 필드는 유지한다. 상세는 저장 한도 1 MiB 내의 전체 `source_values`를 반환한다.

### 최신 전체 수집 실행과 마지막 저장 시각을 별도로 계산한다

목록 범위의 수집 상태는 같은 plugin/source의 `scope_type='full'` 실행 중 `started_at DESC, id DESC` 첫 행으로 정한다. data type별 실행 정보가 현재 schema에 없으므로 상태가 source 전체 범위임을 응답에 명시한다. 실행 이력이 없으면 `never_collected`로 정규화한다. `lastStoredAt`은 해당 plugin/source/data type 레코드의 최대 `last_seen_at`으로 계산해 실행 종료 상태와 분리한다. `running`이나 `failed`여도 기존 저장 결과를 그대로 반환한다.

목록과 상태는 단일 PostgreSQL client에서 읽지만 명시적 read transaction snapshot은 사용하지 않는다. 이 최소 API는 진행 중 수집에서도 저장 완료 묶음을 즉시 보여주는 것을 우선하며, 두 SELECT 사이에 새 묶음이 확정될 수 있는 약한 일관성을 허용한다.

### API module은 조회 계약을 주입받는다

기존 `AppModule.register(connection)`은 PostgreSQL 연결로 조회 adapter를 생성하고, 테스트에서는 `RecordQuery` fake를 직접 등록할 수 있는 구성 경계를 둔다. controller는 문자열 입력을 서비스에 전달하고 공통 검증·오류 코드를 `400 INVALID_QUERY`, `404 RECORD_NOT_FOUND`, `503 QUERY_FAILED`로 변환한다. 응답 메시지는 고정하며 드라이버 오류를 포함하지 않는다.

### 실제 DB 계약 테스트와 API 테스트를 분리한다

`platform-db` 테스트는 migration을 적용한 실제 PostgreSQL에 저장 fixture를 넣고 순서·범위·요약·상태·상세·오류 정제를 검증한다. API 테스트는 fake 조회 계약으로 라우팅과 상태 코드만 검증한다. 원천 호출이 없다는 조건은 호출 시 실패하는 source spy를 테스트 경계에 두고도 조회가 성공함으로써 검증한다.

## Risks / Trade-offs

- [8 KiB 필드 기준은 플러그인 화면 정의를 반영하지 못함] → 필드 정의 기반 projection이 생기기 전까지 명시적이고 결정적인 안전 한도로 사용하고 문서화한다.
- [최신 수집 상태가 data type별 상태로 오해될 수 있음] → 응답에 상태 범위를 `source`로 표시하고 계약 문서에 현재 collection run schema의 범위를 기록한다.
- [고정 상위 N건만 제공해 오래된 레코드를 조회할 수 없음] → 이번 이슈의 최소 조회·장애 독립성을 검증한 뒤 사용자 페이징 이슈에서 cursor와 전체 건수를 설계한다.
- [목록과 상태 사이에 동시 수집 commit이 발생할 수 있음] → 각 값은 확정된 행만 읽으며 강한 snapshot이 필요한 운영 화면 요구가 생길 때 read transaction을 추가한다.

## Migration Plan

1. 기존 migration 변경 없이 조회 코드와 API를 배포한다.
2. 기존 PostgreSQL 데이터로 목록·상세와 수집 상태를 확인한다.
3. 문제가 있으면 코드만 이전 릴리스로 되돌린다. 조회 기능은 schema와 저장 데이터를 변경하지 않아 별도 데이터 rollback이 필요 없다.
