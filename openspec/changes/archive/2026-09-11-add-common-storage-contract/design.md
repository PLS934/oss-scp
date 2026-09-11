## Context

동기는 [proposal.md](./proposal.md)를 따른다. 현재 `collection-engine`은 `TransformRecord[]`와 `TransformRelation[]`로 구성된 제한된 묶음을 소비자에게 전달하고, `platform-db`는 PostgreSQL 연결과 versioned migration 실행 기반만 제공한다. 저장 업무 테이블과 DB 비종속 저장 계약은 아직 없다.

가공 계층은 필드 타입, 필수값, 유일키, 관계, 깊이와 크기를 검증한다. 저장 계층은 이 검증을 반복 구현하지 않고 영속화에 필요한 범위 식별, DB 한도, 참조 무결성과 트랜잭션 경계를 책임진다. PostgreSQL을 첫 구현으로 제공하되 계약은 후속 MySQL 구현이 같은 동작을 제공할 수 있게 드라이버 타입을 노출하지 않는다.

## Goals / Non-Goals

**Goals:**

- 데이터 종류 추가가 새 업무 테이블이나 repository 추가를 요구하지 않는 공통 저장 모델을 확정한다.
- 재전달에 안전한 레코드·관계 upsert와 내부 ID 보존을 제공한다.
- 저장 데이터, 격리 오류와 checkpoint 사이에 원자성을 제공한다.
- PostgreSQL 구현을 실제 DB 통합 테스트로 검증한다.
- 원천 데이터와 후속 플랫폼 업무 데이터의 소유 경계를 고정한다.

**Non-Goals:**

- MySQL 저장 구현과 PostgreSQL/MySQL 간 데이터 이관
- 조회 API, JSON 내부 필드 검색·정렬 및 필드별 동적 인덱스
- 전체 수집기와 저장소를 묶는 CLI·worker 오케스트레이션
- 전체 수집 완료 후 부재 자산의 보관·복원 또는 영구 삭제
- 담당자·감사 기능 자체와 큰 본문 외부 저장소

## Decisions

### 공통 레코드 테이블과 제한된 JSONB를 사용한다

`platform_records`는 내부 UUID, `plugin_id`, `data_type`, `source_id`, `external_key_type`, 정규화된 `external_key`, `source_values` JSONB, 최초·최종 관측 시각과 생성·갱신 시각을 가진다. `(plugin_id, data_type, source_id, external_key_type, external_key)`에 유일 제약을 둔다.

외부 키는 SDK가 허용한 string 또는 finite number를 받는다. 문자열과 숫자의 충돌을 막기 위해 타입을 별도 컬럼으로 보존하고 값은 canonical text로 저장한다. 숫자는 JavaScript `Number`의 문자열 표현을 사용하며 `-0`은 `0`으로 정규화한다. `NaN`과 무한대는 가공 검증에서 이미 거부되며 저장 경계에서도 방어한다.

전용 `assets`·`findings` 테이블은 초기 조회가 단순하지만 종류가 늘 때마다 본체 migration과 repository 변경이 필요해 제외했다. 데이터 종류별 동적 테이블 생성도 검토했으나 배포 전 migration 검증과 공통 권한·조회 계약이 복잡해져 제외했다.

### 관계는 내부 ID를 참조하는 별도 테이블로 저장한다

`platform_record_relations`는 같은 플러그인·수집처 범위의 `relation_type`, `from_record_id`, `to_record_id`를 저장하고 세 값에 유일 제약을 둔다. 저장 인터페이스는 묶음의 레코드를 먼저 upsert해 외부 참조를 내부 ID로 해석한 뒤 관계를 upsert한다. 기존 또는 현재 묶음에서 해석할 수 없는 끝점은 전체 묶음 오류다.

관계를 JSON 안에 중복 저장하는 방식은 참조 무결성과 내부 ID 유지 검증이 어려워 제외했다. 이번 단계에서는 관계 삭제 동기화를 하지 않는다. 원천 부재 판정은 전체 범위 완료가 검증되는 후속 보관 작업의 책임이다.

### 수집 실행, checkpoint와 격리 오류를 분리한다

`collection_runs`는 실행 단위의 범위·revision·상태·집계와 시각을 저장한다. `collection_checkpoints`는 `(plugin_id, source_id, scope_type, scope_key, config_revision)`별 최신 JSONB checkpoint를 저장한다. 전체 범위는 고정된 `scope_type=full`, 빈 `scope_key`로 표현하고 자산 범위는 `scope_type=asset`과 비어 있지 않은 내부 식별자를 사용한다.

`collection_issues`는 실행 ID, 묶음 시작 checkpoint, source index, 오류 코드·경로·메시지·제한된 key hint를 저장한다. 원천 레코드 전체와 응답 메타데이터는 비밀 및 크기 위험 때문에 저장하지 않는다. checkpoint는 64 KiB, 레코드 JSON은 1 MiB, 오류 메시지와 경로는 각각 2 KiB, key hint는 100자로 제한한다. 레코드 제한은 기존 transform 출력 한도와 맞춘다.

checkpoint를 실행 행에만 넣는 방식은 같은 범위의 최신 재개 위치를 찾고 실행 이력과 분리하기 어려워 제외했다. 격리 오류를 로그에만 쓰는 방식은 checkpoint 진행 전에 재처리 근거를 영속화한다는 조건을 충족하지 못해 제외했다.

### 저장 묶음을 하나의 트랜잭션으로 확정한다

DB 비종속 `RecordStorage` 계약은 실행 시작·종료, 현재 checkpoint 조회와 `commitBatch`를 제공한다. `commitBatch` 입력은 실행 ID와 범위, 시작 checkpoint, 검증된 레코드·관계, 격리 오류, 다음 checkpoint 및 관측 시각을 포함한다. 구현은 다음 순서로 한 트랜잭션에서 처리한다.

1. 입력 크기와 묶음 내 중복 키를 확인한다.
2. 해당 실행과 범위가 일치하는지 확인한다.
3. 레코드를 upsert하고 내부 ID 매핑을 만든다.
4. 관계 끝점을 해석해 upsert한다.
5. 격리 오류를 저장한다.
6. 현재 checkpoint가 입력의 시작 checkpoint와 일치하는지 비교한 뒤 다음 checkpoint를 upsert한다.
7. 실행 집계를 증가시키고 commit한다.

시작 checkpoint 비교는 같은 범위를 동시에 진행하거나 오래된 묶음이 뒤늦게 도착하는 것을 명시적인 충돌로 거부한다. DB 오류는 안정된 저장 오류 코드로 변환하고 드라이버 메시지나 비밀 설정을 외부로 전달하지 않는다.

`collection-engine`의 기존 `consume(batch)`는 검증 결과 전달 경계로 유지한다. 이번 변경은 이를 받을 수 있는 저장 계약과 adapter를 제공하며, 수집기별 checkpoint 생성과 실행 오케스트레이션은 후속 작업에서 연결한다. 계약 테스트는 직접 `commitBatch`를 호출해 모든 원자성 요구를 검증한다.

### 플랫폼 업무 정보는 별도 소유 영역에 둔다

`platform_records.source_values`와 관측 시각만 공통 upsert가 변경한다. 담당자, 수동 상태와 감사 정보는 후속 전용 테이블이 `platform_records.id`를 참조하도록 한다. 현재 migration은 업무 정보의 임시 JSON 컬럼을 추가하지 않는다. 계약 테스트에서는 대표적인 플랫폼 소유 연결 행을 만들어 재수집 이후에도 유지되는지 검증한다.

## Risks / Trade-offs

- [JSONB 내부 조건 검색은 일반 컬럼보다 느릴 수 있음] → 이번 단계에서는 저장 계약만 제공하고, 실제 조회 패턴이 확정된 뒤 허용 필드 기반 인덱스를 별도 설계한다.
- [외부 키를 text로 정규화하면 원래 숫자 표현이 달라질 수 있음] → 키 타입을 보존하고 JavaScript finite number의 canonical 표현만 식별에 사용하며 원본 필드 값은 JSONB에 유지한다.
- [동일 관계가 원천에서 사라져도 이번 upsert만으로 삭제되지 않음] → 부분 수집에서 잘못 삭제하지 않도록 유지하고 검증된 전체 수집의 부재 처리에서 해결한다.
- [오류 근거에 원천 전체를 저장하지 않아 자동 재처리 정보가 제한됨] → 실행 범위, 시작 checkpoint와 source index를 보존해 원천을 다시 읽을 위치를 제공하고 비밀정보 복제를 피한다.
- [PostgreSQL만 먼저 구현되어 공통 계약의 이식성이 완전히 증명되지 않음] → 드라이버 비종속 타입과 계약 테스트를 분리하고 후속 MySQL adapter가 같은 suite를 실행하게 한다.

## Migration Plan

1. 기존 PostgreSQL baseline 다음 번호의 additive migration으로 공통 저장 테이블·제약·인덱스를 생성한다.
2. migration 재실행과 실패 rollback을 기존 runner에서 검증한다.
3. 저장 계약과 PostgreSQL 구현을 배포하되 기존 API나 수집 실행 경로에는 자동으로 연결하지 않는다.
4. 후속 오케스트레이션이 준비되면 저장 소비자를 수집 실행에 연결한다.

코드 롤백 시 새 테이블은 사용되지 않은 채 남겨 하위 버전이 무시하도록 한다. 운영 데이터가 기록된 뒤의 destructive down migration은 제공하지 않으며, 제거가 필요하면 별도의 백업·검증된 migration으로 수행한다.
