## Context

현재 API는 검증된 외부 plugin registry snapshot으로 기동하고, 저장형 대상별 자식 collector CLI를 시작한다. 기동·CLI·API trigger는 공통 runner와 PostgreSQL/MySQL 실행 lease를 공유하며 실행 이력에는 trigger와 결과가 저장된다. 이 변경은 같은 경계에 일일 scheduled 진입점을 추가하므로 시간대 계산, lifecycle, 양쪽 DB migration과 Docker 설정 검증이 함께 필요하다. 동기는 `proposal.md`를 따른다.

## Goals / Non-Goals

**Goals:**

- 기동 시 한 번 검증한 일정으로 다음 현지 발생 시각을 결정하고, 각 발생마다 활성 저장형 대상을 독립적으로 실행한다.
- scheduled 실행도 기존 공통 runner·DB lease·원자적 저장 계약을 재사용한다.
- 재시작, 다중 API 인스턴스, DST 경계, 종료 중 취소에서 중복 실행과 오래된 결과 확정을 방지한다.

**Non-Goals:**

- 분산 scheduler leader 선출, 작업 queue, 자동 retry/backfill 또는 runtime 설정 감시는 도입하지 않는다.
- 기존 run-history 조회 계약 밖의 새 UI나 공개 API를 만들지 않는다.

## Decisions

### 1. 일정은 외부 설정 revision의 엄격한 구조로 검증한다

기존 config loader가 `collection.schedule`을 읽어 unknown key와 타입을 포함해 HTTP listen 전에 검증한다. 비활성화가 기본이며 활성화 시 누락된 timezone/time만 기본값으로 보완한다. 환경 변수만으로 별도 경로를 만드는 대안은 plugin revision과 설정 snapshot이 분리되고 Docker/로컬 동작이 달라지므로 선택하지 않는다.

### 2. 다음 wall-clock 발생을 매번 다시 계산하는 단일 timer를 사용한다

고정 24시간 interval 대신 실행 또는 wake-up 뒤 timezone의 다음 현지 날짜를 계산해 timer를 다시 건다. 이는 DST와 프로세스 정지를 명시적으로 처리하고 놓친 간격을 재생하지 않는다. cron 라이브러리의 암묵적 DST 정책에 의존하는 대안은 요구된 gap/overlap 규칙을 보장하기 어려워 선택하지 않는다. Node 기본 시간대 기능만으로 규칙을 안전하게 구현하기 어렵다면 작고 검증된 timezone 라이브러리를 추가하되 lockfile 변경을 제한한다.

### 3. DST gap은 첫 유효 instant, overlap은 첫 instant로 고정한다

요청된 현지 시각을 가능한 instant 목록으로 해석한다. 목록이 비면 해당 날짜에서 뒤의 첫 유효 instant를, 둘이면 이른 instant를 선택한다. gap 날짜를 건너뛰는 대안과 overlap 두 번 실행하는 대안은 매일 한 번이라는 운영 계약에 맞지 않는다.

### 4. scheduler는 대상별 기존 collector process 경계를 재사용한다

기동 시 확정한 registry에서 `enabled`이고 저장형인 대상을 가져와 기존 process spawn helper로 각각 full 수집한다. `scheduled`, 예정 UTC instant, timezone을 제한된 내부 인자로 전달한다. `Promise.allSettled`에 준하는 격리로 한 spawn 실패가 다른 대상 실행을 막지 않게 한다. runner를 API 프로세스에 중복 구현하는 대안은 CLI/API 간 저장 의미가 갈라지므로 선택하지 않는다.

### 5. DB lease가 다중 인스턴스의 유일한 실행 권한이다

각 API 인스턴스는 자체 timer를 가질 수 있지만 모든 scheduled 요청은 기존 대상·revision·full 범위 lease를 획득해야 한다. 별도 scheduler leader lease는 이중 조정 계층과 장애 복구 복잡도를 늘리므로 추가하지 않는다. 실행 이력 schema는 trigger enum/check와 예정 instant·timezone nullable 필드를 확장하고, scheduled에서만 두 metadata를 요구하도록 storage 경계에서 검증한다.

### 6. 기존 저장 보존 계약을 변경하지 않는다

scheduled run도 공통 runner의 batch transaction과 checkpoint/lease fencing을 사용한다. 실패·partial 결과는 기존 레코드와 플랫폼 소유 담당자·수동 상태를 변경하거나 삭제하지 않는다. 마지막 성공은 별도 mutable 컬럼 대신 완료된 run 이력에서 결정한다.

### 7. lifecycle은 timer와 자식 프로세스를 함께 관리한다

API 종료 시 pending timer를 해제하고 scheduled 자식들의 AbortSignal을 통해 종료를 요청한다. 종료 뒤 callback이 새 작업을 만들지 않도록 세대/closed 상태를 검사한다. 설정 변경은 hot reload하지 않고 재시작 때 새 snapshot과 timer를 만든다.

## Risks / Trade-offs

- [여러 API 인스턴스가 같은 시각에 원천 process를 spawn할 수 있음] → collector가 원천 접근 전에 DB lease를 획득하고, loser가 현재 실행 참조로 종료하는 통합 테스트를 둔다.
- [장시간 timer와 시스템 시계 변경으로 callback이 늦거나 빨라질 수 있음] → wake-up 때 현재 instant를 다시 확인하고 다음 wall-clock 발생을 재계산한다.
- [DB enum/check 확장이 제품별로 다름] → PostgreSQL/MySQL에 각각 versioned migration을 추가하고 동일 storage contract fixture를 실행한다.
- [timezone 데이터 변경에 따라 미래 발생 instant가 달라질 수 있음] → IANA 식별자와 예정 UTC instant를 함께 기록해 실제 실행을 감사 가능하게 한다.
- [격리된 대상 실패가 로그에 비밀을 노출할 수 있음] → 기존 일반화 오류와 자식 stderr 정제 경계를 재사용하고 일정 metadata만 허용한다.

## Migration Plan

1. PostgreSQL과 MySQL의 versioned migration으로 scheduled trigger 및 nullable schedule metadata를 추가한다.
2. API/CLI/storage가 새 필드를 지원하는 동일 release image를 배포한다.
3. 일정은 기본 비활성화이므로 migration 뒤 기존 동작을 먼저 확인한다.
4. 외부 설정 revision에 일정을 추가하고 검증 명령을 통과시킨 뒤 API를 재시작한다.
5. 롤백 시 일정을 비활성화하고 이전 애플리케이션 image로 돌아갈 수 있으나 DB migration은 역행하지 않으며 추가 nullable 필드는 유지한다.
