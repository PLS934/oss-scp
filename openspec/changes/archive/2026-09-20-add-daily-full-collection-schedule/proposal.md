## Why

운영자는 등록된 저장형 수집 대상의 데이터를 매일 정해진 현지 시각에 자동으로 갱신해야 하지만, 현재 플랫폼은 기동 시 또는 수동 요청으로만 전체 수집을 시작한다. 배포 설정으로 제어되는 일일 일정을 추가해 상시 운영 환경에서 예측 가능한 전체 동기화를 제공한다.

## What Changes

- 외부 배포 설정에 기본 비활성화된 일일 수집 일정(`enabled`, IANA `timezone`, `HH:mm` `time`)을 추가하고 잘못된 설정은 HTTP listen 전에 거부한다.
- 일정이 활성화되면 등록·활성화된 저장형 대상마다 공통 full 수집 runner를 시작하고 대상별 실패를 격리한다.
- 예정 시각, 설정 시간대, 실제 시작·종료, 결과를 기존 영속 실행 이력에 기록하고 모든 trigger가 같은 DB lease를 공유하게 한다.
- 현지 시각의 DST gap은 해당 날짜의 첫 유효 시각에 한 번 실행하고, overlap은 첫 번째 발생 시각에만 실행한다.
- 프로세스 중단 중 놓친 일정은 보충하지 않으며 설정 변경은 재시작 뒤 적용한다.
- Docker 설정 주입 검증과 운영 문서를 추가한다.
- 웹 UI 설정, runtime hot reload, cron/요일/복수 시각/대상별 일정, 증분 수집, 재시도·backfill, 별도 worker 인프라는 제외한다.

## Capabilities

### New Capabilities

- `scheduled-full-collection`: 배포 설정, 현지 시각 계산, 대상 선택, 실패 격리, 재시작·DST·종료 동작을 포함한 일일 full 수집 계약을 정의한다.

### Modified Capabilities

- `collection-run-coordination`: `scheduled` trigger와 예정 UTC 시각·설정 시간대를 영속 이력 및 공통 실행권 계약에 추가한다.
- `server-plugin-deployment`: 외부 설정 revision에 일정 설정을 포함하고 기동 전 검증 및 재시작 적용 계약을 추가한다.

## Impact

- API 기동 설정과 lifecycle, 공통 collector CLI trigger 전달, PostgreSQL/MySQL 실행 이력 schema와 adapter가 영향을 받는다.
- 외부 설정 fixture, Compose/Docker smoke 검증, 서버·DB 운영 문서와 개발 계획을 갱신한다.
- 기존 기동 수집·수동 CLI·수동 API 동작과 저장 데이터 및 플랫폼 소유 업무 정보는 유지된다.
