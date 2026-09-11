## Why

수집 결과를 PostgreSQL에 저장할 수 있게 되었지만, 현재는 원천 장애와 무관하게 저장된 데이터를 확인할 공통 조회 경로가 없다. 보안팀과 개발팀이 마지막으로 저장된 목록·상세와 수집 상태를 안정적으로 확인할 수 있도록 DB 제품에 종속되지 않는 최소 조회 계약과 API가 필요하다.

## What Changes

- 저장된 공통 레코드의 제한된 목록과 단건 상세를 반환하는 DB 비종속 조회 계약을 추가한다.
- PostgreSQL 조회 구현은 고정된 안정적 정렬, 서버가 정한 최대 목록 크기, 목록의 큰 본문 제외를 제공한다.
- 조회 결과와 함께 미수집·실행 중·성공·부분 완료·실패 및 마지막 저장 시각을 구분할 수집 상태 계약을 제공한다.
- NestJS에 인증 없이 사용할 수 있는 기본 목록·상세 API를 추가하고 잘못된 입력, 존재하지 않는 ID와 저장소 장애를 안정된 HTTP 오류로 변환한다.
- 실제 PostgreSQL과 API 계약 테스트에서 원천 서비스가 중단되어도 저장 데이터 조회가 원천을 호출하지 않음을 검증한다.
- API 사용법과 현재 범위·제약을 문서화한다.

검색·필터·사용자 선택 정렬·페이지 크기, 프론트 화면, LDAP·역할 권한, MySQL 조회 구현, 큰 본문 전용 저장소와 다운로드는 이번 변경에서 제외한다.

## Capabilities

### New Capabilities

- `platform-record-query`: 저장된 공통 레코드의 제한된 목록·상세, 수집 상태와 PostgreSQL 조회 동작을 정의한다.
- `record-query-api`: NestJS 목록·상세 API의 요청·응답 및 오류 동작을 정의한다.

### Modified Capabilities

없음.

## Impact

- `packages/platform-db`: 공통 조회 타입·오류와 PostgreSQL adapter 및 실제 DB 계약 테스트가 추가된다.
- `apps/api`: 조회 module/controller/service와 HTTP 계약 테스트가 추가되며 기존 health/readiness API는 유지된다.
- PostgreSQL `platform_records`, `collection_runs`를 읽기 전용으로 사용한다. 이번 변경은 migration이나 원천 connector 호출을 추가하지 않는다.
- `docs/`: 기본 조회 API 사용법, 제한 및 후속 권한 경계를 기록한다.
