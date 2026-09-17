## Why

보안팀과 개발팀이 수백 GB PostgreSQL 원천의 프로젝트·컴포넌트·SSCS 정보를 복제 비용 없이 조회해야 한다. #115에 따라 조회 시점에 원천을 읽고 SQL과 화면 선언은 외부 플러그인으로 배포한다.

## What Changes

- `db-postgres`, `persistence: none` source와 PostgreSQL Connection/비밀 참조를 추가한다.
- 제한된 읽기 SQL, 읽기 전용 트랜잭션, 행·시간·응답 크기 한도를 적용한다.
- 기존 목록 검색·필터·정렬 입력 검증과 선언형 화면을 라이브 조회에 연결한다.
- 저장형 UUID 상세 계약은 유지하고 라이브 상세에는 범위와 외부 키를 사용한다.
- 기동·수동 수집에서 라이브 소스를 제외하고 플랫폼 저장 및 수집 이력을 생성하지 않는다.
- watchlist 메모리 캐시 TTL 600초와 플러그인 배포 후 재기동 적용을 설계한다.
- 사용자 지시에 따라 예제 PostgreSQL의 프로젝트·컴포넌트·SSCS를 UNION ALL로 통합해 검증한다. 실제 운영 스키마 연동은 완료 범위로 주장하지 않는다. watchlist는 명시적으로 지정한 예제 조회에 TTL을 적용하는 안을 제안한다.
- 제외: MySQL 원천, 원천 복제, 원천 수정, 무중단 설정 reload, 새 권한 시스템, 임의 transform 결과에 대한 전체 원천 메모리 검색.

## Capabilities

### New Capabilities

- `live-db-plugin-source`: PostgreSQL 라이브 실행, 안전 한도, 무저장, 캐시 및 배포 계약.

### Modified Capabilities

- `plugin-source-contract`: PostgreSQL Connection 및 무저장 source 선언 추가.
- `record-query-api`: 라이브 목록 분기와 별도 상세 경로 추가.
- `startup-full-collection`: 무저장 소스의 자동 수집 제외.

## Impact

`packages/plugin-config`, `apps/api`, `apps/web`, `apps/collector-cli`, 공통 조회 타입 및 `.github/workflows/integration-ci.yaml`이 영향을 받는다. 기존 저장형 어댑터는 유지하고 라이브 응답을 판별하는 계약을 추가한다. PostgreSQL 드라이버와 SQL 구문 검증 의존성을 검토한다. 예제 `plugins/dependency-track-db/`는 확정되지 않은 운영 스키마를 실제 계약처럼 표시하지 않는다. 플랫폼 DB migration은 요구하지 않는다.
