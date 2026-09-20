## 1. 설정과 일정 계산

- [x] 1.1 외부 설정 loader에 엄격한 `collection.schedule` schema와 비활성/default/custom 검증을 추가하고 API 설정 단위 테스트로 생략, 잘못된 키·타입·시간·timezone, 기본값을 확인한다.
- [x] 1.2 다음 현지 실행 instant 계산기를 구현하고 fake clock 단위 테스트로 일반 날짜, timezone 경계, DST gap의 첫 유효 instant, overlap의 첫 instant, 하루 한 번 동작을 확인한다.

## 2. 영속 실행 metadata와 trigger

- [x] 2.1 공통 storage 계약과 collector CLI/process 인자에 `scheduled` trigger, 예정 UTC instant, IANA timezone을 추가하고 잘못된 조합이 거부되는 단위 테스트를 통과시킨다.
- [x] 2.2 PostgreSQL migration과 adapter를 확장하고 실제 PostgreSQL 계약 테스트로 기존 trigger 호환성, scheduled metadata, 실행 결과와 마지막 성공 조회를 확인한다.
- [x] 2.3 MySQL migration과 adapter를 확장하고 실제 MySQL 계약 테스트로 PostgreSQL과 같은 scheduled 실행 의미를 확인한다.
- [x] 2.4 migration 개수를 검증하는 Docker/release fixture를 새 version과 맞추고 migration 검증 스크립트를 통과시킨다.

## 3. API scheduler와 수집 lifecycle

- [x] 3.1 기존 startup process 경계를 재사용하는 scheduled collection 서비스를 구현하고 예정 시각마다 활성 저장형 대상만 독립적으로 spawn하는 테스트를 통과시킨다.
- [x] 3.2 API 기동/종료 lifecycle에 scheduler를 연결하고 테스트로 비활성화, 빈/live-only registry, 재시작 시 no catch-up, timer 취소와 자식 취소 전달을 확인한다.
- [x] 3.3 대상별 spawn/runtime 실패 격리와 scheduled 대 startup·CLI·API·다중 인스턴스 lease 충돌을 자동 테스트해 하나의 대상만 데이터를 확정함을 확인한다.
- [x] 3.4 실패·partial scheduled 수집 뒤 기존 source 데이터, checkpoint와 플랫폼 소유 담당자·수동 상태가 보존되는 회귀 테스트를 통과시킨다.

## 4. 배포와 문서

- [x] 4.1 외부 설정 fixture와 Docker/Compose smoke 검증에 schedule 주입 및 timezone 실행 증거를 추가하고 관련 Docker 테스트를 통과시킨다.
- [x] 4.2 서버·platform DB 운영 문서와 개발 계획에 설정 예시, 기본값, 비활성 범위, 재시작 적용, DST와 누락 일정 규칙을 기록하고 문서 링크/예시를 검토한다.

## 5. 전체 검증

- [x] 5.1 API, collector CLI, platform DB focused 테스트와 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`를 통과시킨다.
- [x] 5.2 `openspec validate add-daily-full-collection-schedule --strict`와 관련 process/Docker 통합 검증을 통과시키고 모든 acceptance scenario에 자동 또는 명시적 smoke 근거가 있는지 확인한다.

## 6. 리뷰 보강

- [x] 6.1 기동 시 definition과 정확한 transform 바이트 digest/source를 불변 snapshot으로 고정하고, 자식이 module top-level 실행 전에 구조·revision·digest를 검증한 뒤 검증한 바이트 자체를 실행하는 회귀 테스트를 통과시킨다.
- [x] 6.2 scheduled 자식 환경을 runtime·`PLATFORM_DB_*`·대상 Connection credential allowlist로 제한하고 `AUTH_*`·`LDAP_*`가 전달되지 않는 테스트를 통과시킨다.
- [x] 6.3 종료 grace 뒤 생존 자식에 `SIGKILL`을 보내고 close 대기를 상한 안에 끝내는 lifecycle 테스트를 통과시킨다.
- [x] 6.4 PostgreSQL `finishRun`을 transaction row lock으로 fencing하고 동일 run 경합에서 하나만 전이되는 실제 DB 테스트를 통과시킨다.
- [x] 6.5 scheduled lease loser가 실패 이력을 만들지 않고 `activeRunId`·예정 instant·timezone을 보존하는 다중 인스턴스 충돌 테스트를 통과시킨다.
- [x] 6.6 focused·전체·process·Docker 검증과 strict OpenSpec 검증을 다시 통과시킨다.

## 7. 추가 리뷰 보강

- [x] 7.1 schedule 활성 preflight와 scheduled 자식에서 상대·절대·package import/require를 module top-level 실행 전에 거부하고, 비-scheduled transform 로딩은 유지하는 회귀 테스트를 통과시킨다.
- [x] 7.2 scheduled 자식 stdout을 크기 상한과 exact event schema로 검증하고 오염·초과·metadata 불일치를 안전하게 실패 처리하는 테스트를 통과시킨다.
- [x] 7.3 lease loser의 `activeRunId`·예정 instant·timezone 참조를 기존 run에 연결하는 PostgreSQL/MySQL migration과 멱등 storage 계약 테스트를 통과시킨다.
- [x] 7.4 실제 scheduler/process 다중 인스턴스 충돌에서 duplicate 참조가 영속화되는 Docker E2E와 전체 검증을 통과시킨다.

## 8. sandbox와 종료 drain 리뷰 보강

- [x] 8.1 scheduled transform을 순수 mapping AST allowlist로 제한하고 ambient global·alias·computed property·`Reflect`·module loader·constructor chain 우회를 top-level 실행 전에 거부하는 회귀 테스트를 통과시킨다.
- [x] 8.2 process exit와 실제 stdio `close`를 구분해 결과 handler 등록까지 bounded wait하고, duplicate 영속화에 고정 drain 상한을 적용하는 lifecycle 테스트를 통과시킨다.
- [x] 8.3 focused·전체·process·Docker 검증과 strict OpenSpec 및 diff 검증을 통과시킨다.

## 9. lexical scope·cross-revision lease 리뷰 보강

- [x] 9.1 scheduled transform identifier를 실제 lexical scope chain으로 해석하고 sibling·nested shadow 우회를 거부하며 순수 `async` arrow와 `await` 호환 테스트를 통과시킨다.
- [x] 9.2 shutdown terminal 상태와 listener 정리로 close 상한 뒤 late callback이 storage 작업을 시작하지 않는 lifecycle 테스트를 통과시킨다.
- [x] 9.3 PostgreSQL/MySQL의 lease·commit·duplicate active identity를 revision 비포함 plugin·source·scope로 통일하고 다중 connection·revision 경합과 stale 결과 fencing 테스트를 통과시킨다.
- [x] 9.4 platform DB 환경 전달을 실제 지원 key의 단일 명시적 allowlist로 제한하고 unknown `PLATFORM_DB_*` 차단 테스트를 통과시킨다.
- [x] 9.5 focused·전체·process·PostgreSQL/MySQL·외부 DB Docker 검증과 strict OpenSpec 및 diff 검증을 통과시킨다.

## 10. process 환경·rolling lock 호환 리뷰 보강

- [x] 10.1 schedule 활성 credential `envRef`의 Node·OS loader process-control 환경 이름을 preflight와 snapshot 준비에서 거부하고 `.env`의 `NODE_OPTIONS=--require` 회귀 테스트를 통과시킨다.
- [x] 10.2 PostgreSQL/MySQL에 revision 비포함 coordinated active-run uniqueness migration을 추가하고 legacy/new lock 경합, unique 오류 정규화와 기존 중복 fail-closed migration 테스트를 통과시킨다.
- [x] 10.3 duplicate 참조가 winner 완료 뒤에도 revision 비포함 FK identity로 저장되며 missing/scope mismatch를 거부하는 양 DB 테스트를 통과시킨다.
- [x] 10.4 MySQL generated lease hash와 active 조회 index를 추가하고 digest·EXPLAIN 계약 및 migration count fixture를 갱신한다.
- [x] 10.5 focused·전체·process·PostgreSQL/MySQL·외부 DB·bundle/release Docker 검증과 strict OpenSpec 및 diff 검증을 통과시킨다.

## 11. rolling cleanup·conflict winner 경합 보강

- [x] 11.1 legacy precheck 뒤 시작된 fresh run을 범위 cleanup이 해제하지 못하도록 PostgreSQL/MySQL DB fence를 추가하고 stale cleanup은 유지한다.
- [x] 11.2 PostgreSQL insert guard conflict payload와 MySQL 동일 statement conflict capture로 status 전이와 무관하게 충돌 winner ID를 식별한다.
- [x] 11.3 양 DB에서 legacy precheck→new start→legacy cleanup/insert 역순 및 conflict 직후 winner 완료·duplicate audit 회귀 테스트를 통과시킨다.
- [x] 11.4 focused·전체·process·PostgreSQL/MySQL·외부 DB·bundle/release Docker 검증과 strict OpenSpec 및 diff 검증을 통과시킨다.
