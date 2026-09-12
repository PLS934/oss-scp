## Context

동기는 [proposal.md](proposal.md)의 Why를 따른다. 현재 저장소에는 NestJS health API, 플러그인 설정 로더의 진행 중 변경, HTTP offset collector가 있지만 플랫폼 DB storage-adapter, 공통 저장형 collection-engine, 수동 CLI 실행 기록은 아직 완성되지 않았다. 따라서 이 변경은 그 선행 계약 위에 기동 trigger를 얹되, 실행 조정과 상태 저장을 API 프로세스 전용 코드로 만들지 않는 순서로 구현해야 한다.

API는 기동 전에 외부 설정 전체를 검증해 하나의 불변 registry와 설정 revision을 확정한다. 이후 HTTP는 장시간 원천 수집과 독립적으로 기존 플랫폼 DB를 조회해야 한다. PostgreSQL·MySQL 모두 지원하고 여러 API 인스턴스가 같은 DB와 설정을 사용할 수 있으므로 프로세스 메모리 mutex만으로는 중복을 막을 수 없다.

## Goals / Non-Goals

**Goals:**

- 기동 trigger, 수동 CLI, 후속 22시 scheduler가 같은 대상 실행 서비스와 상태 모델을 사용한다.
- 대상별 실행권과 저장 fencing을 DB 어댑터 공통 계약으로 제공한다.
- HTTP listen 이후 비동기 수집하면서 상태 등록 실패는 기동 실패로, 원천·가공 실행 실패는 영속 실행 결과로 구분한다.
- 정상 종료 시 취소를 전파하고 비정상 종료 뒤 lease 회수를 가능하게 한다.
- 실제 PostgreSQL·MySQL과 Docker 재기동·동시 기동을 자동 검증한다.

**Non-Goals:**

- Redis, BullMQ, 별도 worker 또는 분산 scheduler를 이번 구현의 필수 구성으로 만들지 않는다.
- 프로세스 장애 직전의 메모리 내 위치에서 자동 재개하지 않는다. 저장 완료 checkpoint를 가진 새 full 실행이 안전하게 다시 처리한다.
- 매일 22시 실행, 자동 재시도, 우선순위·대기열, 사용자 취소 API와 실패 알림 UI를 구현하지 않는다.
- full 수집 성공 뒤 원천에서 사라진 자산을 보관 처리하는 기능은 별도 변경으로 둔다.

## Decisions

### 공통 실행 서비스에 trigger만 주입한다

collection-engine에 `requestFullCollection(trigger, registrySnapshot)` 형태의 프레임워크 독립 진입점을 두고, 대상 열거·실행권 획득·collector→transform→검증→저장·최종화를 담당하게 한다. 수동 CLI와 API 기동 lifecycle은 trigger 값과 동일한 registry snapshot만 전달한다. NestJS provider가 HTTP 또는 내부 controller를 재호출하지 않는다.

API 전용 orchestration은 빠르지만 수동·스케줄 경로와 상태 및 오류 의미가 달라진다. 반대로 모든 작업을 즉시 Redis queue에 넣는 방식은 기본 Compose 설치에 아직 필요하지 않은 운영 의존성을 추가한다. 현재는 같은 프로세스의 제한된 비동기 실행기를 사용하고 실행권·상태를 DB에 두어 후속 worker로 실행 위치를 옮겨도 계약을 유지한다.

### 대상 단위 실행과 상위 요청을 분리해 기록한다

`collection_runs`는 한 번의 trigger와 설정 revision, 집계 상태를 기록하고 `collection_run_targets`는 plugin ID, connection ID, scope, 상태, 건수, checkpoint, 오류 및 실행권 세대를 기록한다. 대상 키는 `(plugin_id, connection_id, data_definition_id, scope_kind, scope_key)`의 정규화 값으로 만들며 full 범위의 scope key는 고정 sentinel을 사용한다.

상위 run만 잠그면 한 대상 실패가 전체 실행권을 점유하거나 서로 다른 대상의 병렬 실행을 막는다. 대상 record만 두면 “이번 기동”의 성공·부분 성공·실패와 설정 revision 전체를 조회하기 어렵다. 두 수준을 분리하고 상위 상태는 대상 terminal 상태로 결정론적으로 집계한다.

상태는 상위 run에 `pending | running | success | partial | failed`, 대상에 `pending | running | success | partial | failed | skipped`를 둔다. 중복 대상은 실제 작업을 만들지 않되 대상 row를 `skipped`로 남기고 현재 owner run/target을 참조한다. 활성 대상이 0개이면 상위 run 자체를 만들지 않는다.

### DB lease와 fencing generation을 실행권 계약으로 사용한다

storage-adapter는 대상 키별 coordination row를 원자적으로 생성·갱신한다. acquire는 활성 lease가 없거나 만료됐을 때만 새 owner token과 단조 증가 generation을 발급한다. 실행기는 제한 시간보다 짧은 간격으로 renew하며, 모든 묶음 저장·checkpoint·최종화는 owner token과 generation 조건을 포함한다. 조건 불일치는 lease 상실 오류로 처리하고 이후 원천 읽기와 transform을 취소한다.

PostgreSQL advisory lock은 연결 종료 시 안전하지만 DB 제품별 의미가 달라지고 장시간 연결을 고정한다. MySQL `GET_LOCK`도 같은 이식성 문제가 있다. unique row만으로 실행 시작 중복은 막을 수 있으나 죽은 프로세스 회수가 어렵다. 명시적 lease+generation은 양쪽 DB에서 조건부 update와 transaction으로 같은 의미를 구현하고 테스트할 수 있다.

기본 lease 기간과 갱신 주기는 운영 환경변수로 노출하지 않고 검증된 보수적 상수로 시작한다. 테스트에는 clock 또는 짧은 테스트 설정을 주입한다. 운영 튜닝 근거가 생기면 별도 설정 계약으로 추가한다.

### 등록 완료 후 listen하고 실제 수집은 비동기로 시작한다

bootstrap 순서는 DB migration/연결 → 외부 registry 검증 → 기동 run 요청 등록 및 각 대상 실행권 경쟁 → HTTP listen → 비동기 대상 실행 시작으로 둔다. 요청 등록 또는 DB 연결이 실패하면 상태를 추적할 수 없으므로 포트를 열기 전에 기동을 실패시킨다. 원천 호출·가공·저장은 listen 이후 수행하며 실패를 대상 실행에 기록한다.

listen을 먼저 하고 등록까지 완전히 fire-and-forget하면 수집 예정 여부를 관찰할 수 없는 창이 생기고 즉시 프로세스가 종료될 때 기동 실행이 유실된다. 반대로 수집 전체 완료 전 listen을 막으면 기존 데이터 조회와 healthcheck가 장시간 실패한다. 짧은 영속 등록만 readiness 경계에 포함하는 절충을 사용한다.

API 종료 hook은 모든 로컬 실행의 AbortController를 취소하고 짧은 종료 유예 동안 실행기가 failed 또는 interrupted 의미의 failed 결과를 기록하도록 시도한다. 강제 종료 시 lease 만료가 복구 경계다. 새 실행은 이전 checkpoint를 읽을 수 있지만 full 범위 의미를 유지하고, connector 안정성 계약에 따라 중복 upsert를 허용한다.

### 설정 revision은 registry 내용으로 결정적으로 계산한다

외부 설정 loader가 제공하는 revision을 그대로 사용한다. 선행 loader에 revision 계약이 없다면 registry에 포함된 등록 목록, 검증된 plugin/source/Connection의 비밀 제외 canonical representation 및 실행 모듈 digest로 SHA-256 revision을 계산한다. 파일 mtime이나 절대 경로는 같은 배포 내용을 다른 revision으로 만들 수 있어 제외한다. secret 값은 해시 입력과 실행 기록 모두에 넣지 않는다.

각 실행은 시작 시 registry snapshot을 고정하며 실행 중 디스크 변경을 다시 읽지 않는다. 새 설정은 API 재기동 후 새 revision의 실행으로만 반영한다.

### 조회 API는 저장 상태만 반환한다

최소 읽기 API는 현재 대상별 상태와 최근 상위/대상 실행을 반환하고 원천에 접근하지 않는다. 최초 성공이 없고 실행도 없으면 `uncollected`, 실행 중이면 `running`, 종료 후에는 terminal 상태와 시작·종료 시각·revision을 반환한다. 오류는 안정적 코드와 비밀정보 없는 요약만 노출한다. 계정관리와 상세 권한은 후속 운영 화면 변경에서 확장하되 이 변경의 기본 비활성 모드에서는 읽기 전용으로 제공한다.

### 제한된 대상 동시성과 실패 격리를 함께 적용한다

대상들은 고정된 작은 worker pool에서 독립 실행하고 각 collector의 기존 backpressure를 유지한다. 한 Promise rejection을 전체 `Promise.all` 실패로 전파하지 않고 대상별로 포착·영속화한 뒤 모든 대상이 terminal이 되면 상위 run을 집계한다. 동시성 기본값은 샘플 Docker 검증에서 결정해 코드 상수로 두고, 무제한 병렬 실행은 허용하지 않는다.

## Risks / Trade-offs

- [API 프로세스 안의 실행은 재배포 시 중단될 수 있음] → 취소 전파, 영속 checkpoint, lease 만료와 idempotent upsert로 안전하게 재실행하고 후속 worker가 같은 계약을 재사용한다.
- [DB clock과 애플리케이션 clock 차이로 lease 판단 오류] → acquire·renew·fencing 조건의 현재 시각은 DB clock만 사용한다.
- [긴 event-loop 정지로 정상 실행이 lease를 잃음] → lease를 예상 GC 지연보다 충분히 길게 두고, 잃은 owner는 모든 저장에서 fencing되어 최신 결과를 덮지 못하게 한다.
- [상위 run 집계 중 프로세스 중단] → 조회 또는 다음 정리 시 대상 terminal 상태에서 상위 상태를 idempotent하게 재계산한다.
- [동일 Connection의 서로 다른 정의가 원천 부하를 높임] → 실행권은 데이터 정의까지 포함해 독립성을 유지하되 제한된 전역 동시성으로 부하를 제한한다. Connection 전체 직렬화가 필요하면 실제 수집처 근거로 별도 정책을 추가한다.
- [선행 storage/collection 계약 변화] → 구현 첫 단계에서 이 명세의 adapter 메서드를 선행 change와 맞추고, 기동 코드 작성 전에 양쪽 DB 계약 테스트를 고정한다.

## Migration Plan

1. 선행 plugin runtime, collection-engine, PostgreSQL·MySQL storage-adapter 및 수동 CLI가 공통 수집 경로를 제공하는지 확인한다.
2. 양쪽 DB에 additive collection run/target/coordination migration을 적용한다. 기존 업무 레코드는 변경하지 않는다.
3. 공통 실행 요청·lease·fencing 계약과 DB별 구현을 배포하되 API 기동 trigger는 아직 연결하지 않는다.
4. 상태 조회와 수동 CLI 회귀 검증 후 API lifecycle trigger를 연결하고 Docker에서 빈 registry, 최초 기동, 재기동, 동시 인스턴스를 검증한다.
5. 롤백 시 API trigger 연결을 먼저 이전 버전으로 되돌린다. additive 테이블은 기존 코드가 참조하지 않으므로 유지하고, 데이터 제거가 필요한 경우에만 별도 승인된 down migration을 사용한다.
