## Why

플랫폼의 공통 레코드 저장·조회 계약은 현재 PostgreSQL에서만 실제 검증되어 운영 DB 선택이 곧 기능 지원 범위를 바꾸는 상태다. 이미 마련된 MySQL 연결·migration 기반에 같은 저장·조회 의미를 구현해 업무 API와 수집 코드가 DB 제품에 종속되지 않음을 검증해야 한다.

## What Changes

- MySQL용 공통 레코드·관계·수집 실행·checkpoint·격리 오류 migration과 필요한 제약·인덱스를 추가한다.
- MySQL 저장 어댑터가 타입을 보존한 유일키 upsert, 관계 저장, 실행 상태와 checkpoint 갱신을 공통 계약대로 수행하게 한다.
- MySQL 조회 어댑터가 저장 레코드 목록·상세·수집 상태와 `lastSeenAt DESC, id ASC` cursor pagination을 PostgreSQL과 같은 외부 의미로 제공하게 한다.
- 같은 fixture와 공통 계약 suite를 실제 PostgreSQL·MySQL에 적용해 내부 ID 유지, rollback·재개, JSON·null·datetime·문자열 비교와 keyset 경계를 교차 검증한다.
- API·수집 실행기는 등록된 플랫폼 DB 제품에 맞는 저장·조회 어댑터를 선택하되 공개 업무 계약은 유지한다.
- 실제 두 DB 계약 검증을 CI에 추가하고 migration, 인덱스, 검증 버전과 지원 범위를 문서화한다.
- DB 제품 간 기존 데이터 이전, 검색·필터·사용자 지정 정렬, 원천 MySQL connector는 포함하지 않는다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `platform-record-storage`: MySQL 구현도 PostgreSQL과 동일한 공통 저장·transaction·checkpoint 계약을 충족하도록 확장한다.
- `platform-record-query`: MySQL 구현도 PostgreSQL과 동일한 목록·상세·상태 및 cursor keyset 의미를 충족하도록 확장한다.

## Impact

`packages/platform-db`의 MySQL migration과 저장·조회 구현, API 및 수집 CLI의 등록 어댑터 선택, PostgreSQL/MySQL 공통 계약 테스트, 통합 CI와 플랫폼 DB·조회 문서가 영향을 받는다. 외부 저장·조회 API 형식과 플러그인 가공 계약에는 breaking change가 없다.
