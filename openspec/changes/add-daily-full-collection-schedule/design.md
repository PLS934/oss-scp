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

기동 시 확정한 registry에서 `enabled`이고 저장형인 대상을 가져와 기존 process spawn helper로 각각 full 수집한다. 각 대상의 runtime definition, revision, transform digest와 정확한 transform 바이트를 기동 전에 불변 snapshot으로 고정한다. scheduled transform은 self-contained 순수 mapping이어야 한다. AST allowlist는 `const`, lexical scope의 arrow function, 안전한 `async` arrow/`await`, 객체·배열·고정 property mapping, 산술·비교·논리 연산과 제한된 `String`·`Number`·`Boolean`·`Date` 변환 및 TypeScript CommonJS export scaffolding만 허용한다. identifier는 실제 참조 위치의 현재 lexical scope chain에서만 해석하며 sibling·nested scope의 binding을 공유하지 않는다. `process`, `globalThis`, ambient `this`, `eval`, `Function`, `Reflect`, constructor/prototype chain, 동적 computed access와 모든 import/require/module loader는 기본 거부하며 module top-level 실행 전에 전체 AST를 검증한다. 이 제한은 schedule 활성 preflight와 자식 검증에만 적용해 비-scheduled transform 계약은 유지한다. schedule 비활성 preflight는 기존 Node module loader로 CommonJS와 ESM transform을 검증하고 manager 준비는 빈 target 상태로 끝내며 scheduled transform snapshot·sandbox를 만들지 않는다. 자식은 snapshot의 구조·revision·digest를 module top-level 실행 전에 검증하고, 검증한 바이트 자체를 파일 재조회 없이 실행한다. `scheduled`, 예정 UTC instant, timezone을 제한된 내부 인자로 전달한다. 자식 환경은 필수 runtime 값, platform DB loader가 지원하는 명시적 설정 key, 해당 대상 Connection이 참조하는 수집 credential만 allowlist하며 unknown `PLATFORM_DB_*`, `AUTH_*`, `LDAP_*`는 전달하지 않는다. credential `envRef`가 `NODE_OPTIONS`, `NODE_PATH`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `LD_AUDIT`, `DYLD_*`, `LIBPATH`, `SHLIB_PATH`, `OPENSSL_CONF`, `OPENSSL_MODULES`처럼 child 코드·loader 동작을 바꿀 수 있는 이름이면 schedule 활성 preflight와 snapshot 준비에서 fail closed 거부한다. 이 제한은 scheduled 대상에만 적용한다. `Promise.allSettled`에 준하는 격리로 한 spawn 실패가 다른 대상 실행을 막지 않게 한다. runner를 API 프로세스에 중복 구현하는 대안은 CLI/API 간 저장 의미가 갈라지므로 선택하지 않는다.

### 5. DB lease가 다중 인스턴스의 유일한 실행 권한이다

각 API 인스턴스는 자체 timer를 가질 수 있지만 모든 scheduled 요청은 `pluginId`·`sourceId`·`scopeType`·`scopeKey`로 정한 공통 lease를 획득해야 한다. `configRevision`은 실행 이력·checkpoint identity에는 보존하지만 lease identity에서는 제외해 rolling restart 중 서로 다른 revision도 동시에 원천을 실행하거나 결과를 확정할 수 없게 한다. commit도 같은 revision 비포함 lease lock 아래에서 running run과 revision 일치를 확인하므로 이전 revision의 stale 결과는 최신 실행 뒤 확정되지 않는다. 구버전의 revision 포함 advisory/application lock과 신버전 lock은 서로 직렬화되지 않으므로 PostgreSQL partial unique index와 MySQL generated lease hash·active marker unique index가 coordinated running row를 DB에서 하나로 제한한다. PostgreSQL은 모든 coordinated insert를 revision 비포함 guard row로 직렬화하고 충돌 시 그 순간의 winner ID를 DB 오류 payload에 담는다. MySQL은 `(lease_hash, status, coordinated, heartbeat_at)` index와 `INSERT ... ON DUPLICATE KEY UPDATE`의 동일 statement session capture를 사용해 unique 충돌 row ID를 원자적으로 회수한다. 따라서 winner가 오류 처리 전에 완료되어도 adapter는 `RUN_ALREADY_ACTIVE(activeRunId)`를 반환하고 duplicate audit FK에 연결할 수 있다. migration 시 이미 같은 lease에 active row가 둘 이상 있으면 자동 상태 변경이나 삭제를 하지 않고 migration을 실패시켜 운영자가 이력을 확인하고 명시적으로 정리한 뒤 재실행하게 한다. 별도 scheduler leader lease는 이중 조정 계층과 장애 복구 복잡도를 늘리므로 추가하지 않는다. lease loser는 실패 run을 새로 만들지 않고 현재 `activeRunId`와 예정 instant·timezone을 비민감 duplicate event로 반환한다. 부모 scheduler는 stdout을 16 KiB 상한과 exact event schema로 검증하며, 유효한 duplicate만 별도 `scheduled_collection_references` 이력에 기존 run FK로 멱등 저장한다. duplicate 참조는 stdout 도착 전에 winner가 완료될 수 있으므로 현재 running/heartbeat를 다시 요구하지 않고 FK run의 revision 비포함 plugin·source·scope identity만 검증한다. 오염·초과·metadata 또는 exit code 불일치는 저장하지 않고 일반화된 안전 오류로 처리한다. 실행 이력 schema는 trigger enum/check와 예정 instant·timezone nullable 필드를 확장하고, scheduled에서만 두 metadata를 요구하도록 storage 경계에서 검증한다. PostgreSQL `finishRun`은 MySQL과 같은 의미로 row lock을 건 transaction에서 running 상태와 유효 lease를 확인한 하나의 호출만 상태를 전이한다.

구버전 cleanup은 active precheck 뒤 다른 revision의 새 run이 시작될 수 있다. PostgreSQL update trigger와 MySQL `finish_authorized` check constraint는 heartbeat가 유효한 coordinated run의 일반 `failed` 전이를 거부하고, 현재 adapter가 row lock·lease 검증 뒤 명시적으로 표시한 finish만 허용한다. heartbeat가 만료된 run은 구버전 SQL로도 계속 정리할 수 있다. 이 fail-closed fence는 구버전 cleanup이 새 lease를 해제한 뒤 자신의 run을 insert하는 역순 경합을 막으며, 명시적 finish 표식이 없는 구버전의 fresh failure 전이도 안전하게 거부한다.

### 6. 기존 저장 보존 계약을 변경하지 않는다

scheduled run도 공통 runner의 batch transaction과 checkpoint/lease fencing을 사용한다. 실패·partial 결과는 기존 레코드와 플랫폼 소유 담당자·수동 상태를 변경하거나 삭제하지 않는다. 마지막 성공은 별도 mutable 컬럼 대신 완료된 run 이력에서 결정한다.

### 7. lifecycle은 timer와 자식 프로세스를 함께 관리한다

API 종료 시 pending timer를 해제하고 실행 중인 scheduled 자식에 `SIGTERM`으로 종료를 요청한다. process exit 상태만으로 stdio drain을 완료했다고 간주하지 않고 실제 `close` event까지 grace 안에서 기다려 결과 handler를 등록한다. grace period 뒤에도 생존한 자식에는 `SIGKILL`을 보내고 close 대기도 유한 상한 뒤 끝낸다. 등록된 duplicate 영속화 작업은 가능한 만큼 drain하되 별도 고정 상한 뒤 DB 응답을 더 기다리지 않고 종료한다. close 대기 상한이 끝나면 manager를 terminal 상태로 만들고 결과 listener를 제거해 늦은 `close` callback이 새 storage 작업을 시작하지 못하게 한다. 설정·transform 변경은 hot reload하지 않고 재시작 때 새 snapshot과 timer를 만든다.

## Risks / Trade-offs

- [여러 API 인스턴스가 같은 시각에 원천 process를 spawn할 수 있음] → collector가 원천 접근 전에 DB lease를 획득하고, loser가 현재 실행 참조로 종료하는 통합 테스트를 둔다.
- [장시간 timer와 시스템 시계 변경으로 callback이 늦거나 빨라질 수 있음] → wake-up 때 현재 instant를 다시 확인하고 다음 wall-clock 발생을 재계산한다.
- [DB enum/check 확장이 제품별로 다름] → PostgreSQL/MySQL에 각각 versioned migration을 추가하고 동일 storage contract fixture를 실행한다.
- [timezone 데이터 변경에 따라 미래 발생 instant가 달라질 수 있음] → IANA 식별자와 예정 UTC instant를 함께 기록해 실제 실행을 감사 가능하게 한다.
- [격리된 대상 실패가 로그에 비밀을 노출할 수 있음] → 기존 일반화 오류와 자식 stderr 정제 경계를 재사용하고 일정 metadata만 허용한다.
- [자식이 검증과 실행 사이 transform 파일 교체 또는 API 인증 비밀을 관측할 수 있음] → 기동 시 읽은 정확한 바이트를 digest와 함께 pipe로 전달해 검증한 바이트를 실행하고 자식 환경을 명시적 allowlist로 제한한다.
- [snapshot transform이 ambient Node capability나 helper/package를 통해 검증한 바이트 밖의 코드에 접근할 수 있음] → schedule 활성 경로는 좁은 순수 mapping AST allowlist만 허용하고 ambient global, 동적 property, constructor/prototype와 모든 module loader를 실행 전 거부한다.
- [자식 stdout 오염이 잘못된 active run 참조나 메모리 사용을 만들 수 있음] → 작은 고정 상한, 단일 JSON exact schema, plugin·schedule metadata와 exit code 일치를 모두 확인한 뒤 FK 참조만 저장한다.
- [exit 뒤 stdio close 또는 duplicate DB 저장이 끝나지 않아 API shutdown을 무기한 막을 수 있음] → 실제 close까지 bounded wait해 가능한 결과를 등록하고, SIGTERM grace·SIGKILL 뒤 close·결과 drain에 각각 상한을 둔다.
- [rolling restart 중 서로 다른 config revision이 같은 대상을 동시에 실행하거나 이전 결과가 최신 데이터를 덮을 수 있음] → revision을 제외한 공통 lease identity로 start·commit·duplicate validation을 직렬화하고 revision은 실행 이력과 checkpoint에만 보존한다.
- [구버전과 신버전이 서로 다른 application lock을 잡거나 기존 DB에 중복 active row가 있음] → DB unique 제약으로 새 중복을 차단하고 충돌을 현재 run 참조로 변환하며, 기존 중복은 데이터를 자동 수정하지 않고 migration을 중단한다.
- [구버전 cleanup이 precheck 뒤 시작된 새 revision run을 failed로 바꾸거나 winner가 충돌 직후 완료됨] → fresh failed 전이를 DB fence로 거부하고 stale cleanup만 허용하며, insert guard/동일 statement conflict capture로 충돌 시점의 immutable run ID를 회수한다.

## Migration Plan

1. PostgreSQL과 MySQL의 versioned migration으로 scheduled trigger, nullable schedule metadata, duplicate run 참조 이력과 revision 비포함 active-run uniqueness/index를 추가한다. 기존 중복 active row가 있으면 migration은 비파괴적으로 실패하며 운영자가 이력을 확인해 하나의 실행만 남긴 뒤 재실행한다.
2. API/CLI/storage가 새 필드를 지원하는 동일 release image를 배포한다.
3. 일정은 기본 비활성화이므로 migration 뒤 기존 동작을 먼저 확인한다.
4. 외부 설정 revision에 일정을 추가하고 검증 명령을 통과시킨 뒤 API를 재시작한다.
5. 롤백 시 일정을 비활성화하고 이전 애플리케이션 image로 돌아갈 수 있으나 DB migration은 역행하지 않으며 추가 nullable 필드는 유지한다.
