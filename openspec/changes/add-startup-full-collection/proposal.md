## Why

현재 수동 CLI 수집만으로는 최초 설치 직후 데이터가 준비되지 않고, API 재시작 시 승인된 설정 revision의 등록 대상을 자동으로 갱신할 수 없다. API 요청 처리를 막지 않는 기동 전체 수집과 영속 실행권·상태 계약을 추가해 단일 및 다중 인스턴스에서 안전하게 최신 데이터를 준비해야 한다.

## What Changes

- API가 기동할 때 확정된 runtime registry의 등록·활성 대상마다 전체 범위 수집을 비동기로 요청한다.
- 등록·활성 대상이 없으면 실행 기록이나 작업을 만들지 않는다.
- 기동 수집은 수동 CLI와 같은 공통 수집 코어 및 저장 계약을 사용하며 대상별 실패를 격리한다.
- 플랫폼 DB에 설정 revision, 대상, 범위, 상태, 시작·종료 시각과 성공·오류 결과를 영속 기록하고 최초 수집 전·진행 중·완료 상태를 조회할 수 있게 한다.
- DB 기반 실행권과 결과 확정 순서를 적용해 여러 API 인스턴스 또는 다른 전체 수집과 동일 대상·범위가 겹치지 않고 오래된 실행 결과가 최신 결과를 덮지 않게 한다.
- HTTP listen과 저장 데이터 조회를 장시간 수집 완료까지 막지 않되, 기동 요청 등록 실패와 백그라운드 실행 실패를 구분한다.
- PostgreSQL·MySQL 공통 계약, API 기동 프로세스, Docker 빌드·기동 회귀 검증을 추가한다.
- 매일 22시 스케줄 실행, 자동 재시도, Redis/BullMQ·별도 worker 도입, 실행 취소 UI와 실패 알림 화면은 이 변경에서 제외한다.

## Capabilities

### New Capabilities

- `startup-full-collection`: API 기동 시 등록 대상 전체 수집 요청, 비차단 실행, 대상별 격리와 빈 registry 동작을 정의한다.
- `collection-run-coordination`: 수집 실행의 영속 상태, 설정 revision 추적, 동일 대상·범위 실행권과 최신 결과 보호 계약을 정의한다.

### Modified Capabilities

- `server-bootstrap`: 외부 설정 검증 후 HTTP 요청 처리를 시작하면서 기동 전체 수집을 비동기로 요청하는 서버 기동 동작을 추가한다.

## Impact

- `apps/api`: 기동 lifecycle, runtime registry 소비, 수집 상태 조회 API와 종료 처리가 변경된다.
- 공통 collection-engine 및 수동 CLI: 대상 실행 진입점과 결과 계약을 공유하도록 확장된다.
- PostgreSQL·MySQL storage-adapter와 migration: collection run, 대상 실행권 및 결과 확정 메타데이터가 추가된다.
- 외부 플러그인·Connection registry: 활성 대상과 설정 revision을 실행 입력으로 제공해야 한다.
- Docker Compose와 CI: 실제 DB 및 mock 원천을 사용한 최초 기동·재기동·동시 기동 검증이 추가된다.
- 기존 health 및 저장 데이터 조회 계약은 호환되며, 새 상태 조회 계약은 추가 방식으로 제공한다.
