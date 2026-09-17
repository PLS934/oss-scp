## Context

동기는 [proposal.md](proposal.md)의 Why를 따른다. 현재 API는 검증된 runtime registry를 메모리에 고정하고, 기동 시 플러그인별 collector CLI 자식 프로세스를 실행한다. CLI는 collector 선택·플랫폼 DB 연결·공통 `runCollection` 호출을 한 함수에 조립하며, PostgreSQL과 MySQL storage는 같은 대상 full 범위의 exclusive run, heartbeat, checkpoint 원자성 및 이전 실행 결과 보호를 제공한다.

레코드 목록 응답은 최근 run 상태와 마지막 저장 시각을 포함하지만 마지막 성공 시각이나 trigger, API 요청과 대상 실행의 상관관계는 제공하지 않는다. 웹 목록은 조회 생명주기와 cursor 이력만 관리한다. 인증·역할 구현은 아직 없으며 계정관리 비활성 모드가 현재 지원 범위다. 한편 플러그인 설정은 현재 하나의 plugin ID당 하나의 검증된 collection definition을 허용하지만, 외부 계약은 향후 복수 활성 대상을 허용하는 플러그인 단위로 둔다.

## Goals / Non-Goals

**Goals:**

- API 요청을 짧게 접수하고 장시간 수집을 HTTP 생명주기 밖에서 수행한다.
- 기동·CLI·수동 API가 collector 조립과 DB 실행권 의미를 공유한다.
- 요청 식별자와 실제 대상 run의 관계, 중복 참조 및 마지막 성공 시각을 안정적으로 조회한다.
- 목록 route·cursor·polling 경쟁에서도 현재 화면만 갱신한다.
- 현재 비활성 권한 정책과 후속 `collection:execute` 정책을 실행 서비스와 분리한다.

**Non-Goals:**

- 프로세스 재시작 뒤 API 요청 polling 자체를 계속 보장하는 범용 durable queue를 만들지 않는다. 실제 대상 run 상태와 데이터 안전성은 DB 기록과 lease로 보장한다.
- 전역 동기화, 사용자 취소, 자동 재시도·우선순위, 정기 scheduler나 별도 worker를 추가하지 않는다.
- 이번 변경에서 LDAP·세션·역할 저장소 또는 운영 토큰을 구현하지 않는다.
- plugin/source 설정 schema에 활성화 토글을 새로 추가하지 않는다. 현재 registry에 실행 가능한 definition이 없으면 비활성 또는 대상 없음으로 취급한다.

## Decisions

### API 실행 관리자와 프레임워크 독립 실행 코어를 분리한다

collector 선택, scope·revision 구성, storage 연결과 `runCollection` 호출을 `apps/collector-cli`의 process/인자 처리에서 분리해 CLI와 API가 호출하는 프레임워크 독립 함수로 만든다. API 실행 관리자는 registry snapshot에서 plugin ID에 속한 definitions를 선택하고 제한된 로컬 작업으로 실행한다. controller는 요청 등록 결과만 기다리고 `202 Accepted`를 반환하며 수집 완료를 기다리지 않는다.

기존처럼 자식 CLI를 spawn하는 대안은 프로세스 격리가 쉽지만 실제 run ID를 종료 전 JSON event에서만 얻을 수 있고 요청 ID·중복 실행·종료 제어를 별도 IPC로 다시 설계해야 한다. DB queue/worker는 재시작 복구가 강하지만 113번에 필요하지 않은 배포 의존성과 운영 모델을 추가하므로 제외한다. 실행 코어 분리는 기존 collector와 storage 의미를 유지하면서 테스트 가능한 최소 경계다.

API manager는 앱 종료 시 자신이 시작한 AbortController만 취소하고 terminal 기록 시도를 기다린다. 기동 manager와 CLI가 시작한 실행은 공유 DB 실행권으로만 조정하며 서로의 프로세스 생명주기를 직접 제어하지 않는다.

### 요청 식별자와 대상 run 식별자를 분리한다

API는 접수 시 UUID 요청 ID를 발급하고 `accepted` 상태를 만든 뒤 대상 작업을 시작한다. 대상별 `runCollection`이 DB 실행권을 획득하면 실제 run ID를 요청 상태에 연결한다. 중복이면 storage가 반환하는 안정된 active run 참조를 요청 결과에 연결하며 새 collector를 시작하지 않는다. 플러그인 수준 상태는 모든 대상이 성공하면 success, 성공·부분·실패가 섞이면 partial, 성공한 대상이 없으면 failed로 집계한다.

현재 구현은 plugin ID당 definition 하나지만 요청 모델은 대상 배열을 사용해 registry가 복수 definition을 지원할 때 API 계약을 바꾸지 않는다. 요청 식별자를 곧바로 collection run ID로 쓰는 대안은 실행권 획득 전에 응답할 수 없고, 복수 대상 및 중복 참조를 표현하지 못해 제외한다.

요청 상태는 API 프로세스 메모리에 제한적으로 유지하되 대상 run 상태는 DB를 source of truth로 조회한다. terminal 요청은 고정된 TTL과 최대 개수로 제거해 무제한 메모리 증가를 막는다. 프로세스 재시작 뒤 이전 요청 ID 조회는 not-found가 될 수 있지만, 플러그인 상태와 실제 run 결과·데이터는 DB에 남는다. durable API request table은 정기/worker 설계와 함께 후속 검토한다.

### 중복 실행은 기존 DB 계약을 확장해 명시적으로 반환한다

`RecordStorage.startRun`이 active exclusive run을 일반 저장 실패로만 반환하지 않고 `RUN_ALREADY_ACTIVE`와 안전한 active run ID를 제공하도록 공통 오류 계약을 확장한다. PostgreSQL과 MySQL은 현재의 transaction/advisory lock 경계 안에서 같은 결과를 반환한다. API는 이를 `409 Conflict`로 변환하고, CLI·기동 경로는 기존 종료 의미를 유지하되 같은 공개 원인으로 기록한다.

프로세스 메모리 mutex만 두는 대안은 여러 API 인스턴스, 기동 자식 프로세스 및 CLI 충돌을 막지 못한다. API가 실행 전에 별도 status query를 하는 방식은 검사와 시작 사이 경쟁이 있으므로 DB `startRun` 결과만 권위 있는 중복 판정으로 사용한다.

trigger와 API request ID는 collection run의 additive metadata로 저장한다. 마이그레이션은 기존 행에 호환되는 기본 trigger를 제공하며 credential, 원천 오류 원문 또는 사용자 입력 문자열은 저장하지 않는다. 묶음 저장과 기존 플랫폼 소유 필드 보존 규칙은 바꾸지 않는다.

### 권한 판단을 authorizer port로 고정한다

controller는 대상 조회나 요청 등록 전에 `ManualSyncAuthorizer.canExecute(context)`를 호출한다. 현재 기본 구현은 계정관리 비활성 정책으로 허용하지만 명시적인 authorizer 호출을 생략하지 않는다. 후속 인증 구현은 같은 port에 `collection:execute` 검사를 주입한다. 거부 응답은 plugin ID 존재 여부나 active run을 조회하기 전에 동일한 `403`을 반환한다.

이번 변경에서 고정 운영 토큰을 추가하는 대안은 새로운 secret 배포·rotation·브라우저 전달 계약을 만들고 예정된 계정관리 모델과 중복되므로 제외한다. controller 내부에 항상 허용을 직접 코딩하는 방식도 후속 권한 적용 시 실행 서비스 변경을 강제하므로 제외한다.

### 상태 조회는 요청 상태와 플러그인 가용성을 함께 제공한다

접수 응답은 request ID와 status URL을 제공한다. 요청 상태 endpoint는 caller가 시작한 실행의 집계 상태와 대상별 공개 결과를 반환한다. 별도의 plugin sync capability endpoint는 현재 registry 가용성, 실행 가능 여부, 현재 run, 최근 결과와 마지막 success 종료 시각을 DB에서 읽어 목록 첫 렌더링과 새로고침에 사용한다.

레코드 목록 응답에 모든 실행 메타데이터를 계속 추가하는 대안은 레코드 paging과 운영 동작을 결합하고 권한이 다른 읽기·실행 정보를 한 cache 단위로 만든다. 기존 collection 상태는 호환성을 위해 유지하고, 수동 동기화 제어에 필요한 추가 정보는 별도 endpoint로 분리한다.

공개 오류는 allowlist code와 고정 안내만 사용한다. 원본 collector/driver 오류, URL query, Connection 설정, stack은 API와 브라우저 상태에 넣지 않는다.

### 웹은 실행 중에만 polling하고 완료 시 조회 세션을 재설정한다

목록 route마다 sync capability를 조회해 버튼과 범위 안내를 렌더링한다. 접수 요청 중에는 즉시 버튼을 비활성화하고, `202` 뒤에는 request status를 bounded interval로 polling한다. terminal 상태가 되면 polling을 중단하고 결과 배너와 마지막 성공 시각을 갱신한 뒤 navigation reducer에 refresh/reset action을 보내 cursor 이력을 비우고 첫 페이지를 재조회한다.

polling과 목록 요청은 각각 AbortController와 route/session generation을 사용한다. route 변경, unmount 또는 새 실행 전에 이전 요청을 취소하며 늦은 결과는 generation 비교로 폐기한다. 브라우저 새로고침으로 로컬 request ID를 잃어도 capability endpoint의 current run을 보고 실행 중 상태를 복구한다.

WebSocket/SSE는 단일 장시간 동작의 낮은 갱신 빈도에 비해 reverse proxy와 reconnect 계약을 늘리므로 제외한다. 고정 interval polling은 실행 중인 화면에서만 수행하고 terminal 또는 route 이탈 시 중단한다.

## Risks / Trade-offs

- [API 프로세스 재시작 시 메모리 request ID 상태를 잃음] → 실제 대상 run과 마지막 결과는 DB에 유지하고 plugin capability 조회로 화면 상태를 복구하며, durable 요청 큐는 후속 worker 설계에서 다룬다.
- [현재 하나인 plugin definition을 복수 대상으로 추상화해 코드가 늘어남] → 외부 계약과 manager 집계만 배열로 두고 범용 queue·scheduler 추상화는 만들지 않는다.
- [중복 요청이 `202`가 아니라 `409`여서 클라이언트 분기가 필요함] → active run 참조와 동일한 running 표시로 수렴시키고 두 번째 collector가 시작되지 않음을 API 테스트로 고정한다.
- [짧은 polling 간격이 API·DB 부하를 늘림] → 실행 중인 현재 화면에서만 bounded interval과 단일 in-flight 요청을 허용하고 백그라운드/route 이탈 시 취소한다.
- [마지막 성공 시각 조회가 DB별로 달라질 수 있음] → PostgreSQL·MySQL에 동일 fixture와 contract test를 적용한다.
- [수동 수집이 원천 부하를 즉시 유발함] → 플러그인 단위로만 실행하고 기존 대상 실행권 및 collector backpressure·제한을 유지하며 전역 실행은 제공하지 않는다.

## Migration Plan

1. 공통 실행 코어와 DB 중복 오류·trigger metadata·마지막 성공 조회 계약을 추가하고 PostgreSQL·MySQL migration 및 contract test를 먼저 적용한다.
2. CLI와 기동 수집을 공통 코어로 전환해 기존 실행·취소·공개 로그 회귀 테스트를 통과시킨다.
3. API authorizer, 실행 manager, 접수·상태·capability endpoint를 연결하고 종료 처리와 다중 인스턴스 중복을 검증한다.
4. 웹 버튼·범위 안내·polling·결과·첫 페이지 갱신을 연결하고 접근성 및 늦은 응답 경쟁을 검증한다.
5. API·클라이언트 운영 문서를 갱신하고 PostgreSQL·MySQL Docker 환경에서 수동 실행과 기존 기동 수집 충돌을 검증한다.

롤백 시 웹 동작과 API route를 먼저 이전 버전으로 되돌린다. additive DB column/table은 이전 코드가 무시하도록 유지하며 기존 실행·레코드·checkpoint를 삭제하지 않는다. 새 migration 데이터 제거가 필요하면 별도 승인된 전진 migration으로 처리한다.
