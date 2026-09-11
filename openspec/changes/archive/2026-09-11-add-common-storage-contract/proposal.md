## Why

플러그인의 가공·검증 결과를 현재는 플랫폼 DB에 영속화할 공통 계약이 없어 수집 결과를 재사용하거나 중단 지점부터 안전하게 재개할 수 없다. 다양한 플러그인 데이터 종류를 본체 테이블과 repository 수정 없이 저장하면서도 중복 방지, 관계, 격리 오류와 checkpoint의 일관성을 보장하는 첫 PostgreSQL 저장 경로가 필요하다.

## What Changes

- 플러그인·데이터 종류·수집처·타입 보존 외부 키로 레코드를 식별하는 공통 저장 계약을 추가한다.
- 검증된 값을 제한된 JSONB로 저장하고 재전달 시 내부 ID를 유지하는 PostgreSQL migration과 묶음 upsert를 추가한다.
- 레코드 관계, 수집 실행, 범위별 checkpoint와 격리 오류를 영속화한다.
- 한 묶음의 레코드·관계·격리 오류·checkpoint를 단일 트랜잭션으로 확정하고 실패 시 모두 롤백한다.
- 원천이 갱신하는 값과 플랫폼이 관리할 업무 정보를 분리해 재수집이 후자를 덮어쓰지 않는 경계를 정한다.
- 실제 PostgreSQL을 사용하는 공통 계약 및 통합 테스트와 저장 계약 문서를 추가한다.
- MySQL 저장 구현, 조회 API와 JSON 필드별 검색 인덱스, 자동 보관·복원, 담당자 기능, 수집기와의 전체 실행 오케스트레이션은 이번 범위에서 제외한다.

## Capabilities

### New Capabilities

- `platform-record-storage`: 확장 가능한 공통 레코드·관계 저장, 수집 실행·checkpoint·격리 오류의 트랜잭션 영속화와 PostgreSQL 구현을 정의한다.

### Modified Capabilities

없음.

## Impact

- `packages/platform-db`에 저장 인터페이스·PostgreSQL 구현·migration·통합 테스트가 추가된다.
- `@oss-scp/plugin-sdk`의 검증된 레코드·관계 타입을 저장 입력으로 재사용하며 공개 HTTP API에는 변경이 없다.
- PostgreSQL 업무 스키마가 추가되지만 기존 연결·migration 계약과 이전 migration은 호환성을 유지한다.
- 관련 이슈: #29. 선행 구현인 #27과 #41의 연결 및 가공·검증 계약 위에서 동작한다.
