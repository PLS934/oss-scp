## 1. 공통 실행 및 DB 조정 계약

- [x] 1.1 collector 선택·scope/revision 구성·storage 연결·`runCollection` 호출을 CLI process 처리에서 프레임워크 독립 실행 코어로 분리하고 기존 CLI 단위·process 테스트로 출력, 종료 코드, 취소와 자원 정리가 유지됨을 검증한다.
- [x] 1.2 실행 입력에 `startup | cli | api` trigger와 선택적 API 요청 ID를 추가하고 collection-engine runner 테스트로 허용 값, 전달 및 비밀정보 제외를 검증한다.
- [x] 1.3 `RecordStorage.startRun`의 중복 실행 결과를 `RUN_ALREADY_ACTIVE`와 안전한 active run 참조로 확장하고 storage 공통 계약 테스트로 두 번째 collector가 시작되지 않음을 검증한다.
- [x] 1.4 PostgreSQL·MySQL migration과 adapter에 trigger/request 상관관계 및 마지막 성공 조회를 additive하게 구현하고 양쪽 DB 통합 테스트로 기존 행 호환성, 동일 대상 경쟁, lease 만료, 오래된 저장 차단과 성공 시각 결과가 같음을 검증한다.
- [x] 1.5 기동 수집과 수동 CLI를 공유 실행 코어·중복 오류 계약에 연결하고 API 기동 및 CLI 회귀 테스트로 기존 비차단 실행, 오류 로그, 종료 처리가 유지됨을 검증한다.

## 2. 수동 동기화 API

- [x] 2.1 `collection:execute` authorizer port와 계정관리 비활성 허용 구현을 추가하고 controller/service 테스트로 권한 검사가 대상 조회보다 먼저 실행되며 거부 시 동일한 `403`만 반환함을 검증한다.
- [x] 2.2 플러그인의 활성 definitions를 선택해 요청 ID를 발급하고 bounded 메모리 상태·AbortController·terminal 집계를 관리하는 비동기 실행 manager를 구현하며 단위 테스트로 `202` 선응답, 대상 격리, success/partial/failed 집계, TTL/개수 제한과 종료 취소를 검증한다.
- [x] 2.3 수동 실행 접수, 요청 상태, plugin capability/status endpoint와 안정된 공개 DTO·오류 매핑을 추가하고 API 테스트로 `202`, unavailable/no-target, `409` active run 참조, not-found 비식별화와 민감정보 비노출을 검증한다.
- [x] 2.4 manager를 NestJS lifecycle과 runtime registry·DB adapter에 연결하고 서버 통합 테스트로 장시간 작업 중 HTTP 응답, 앱 종료, 기동/CLI/API 충돌 및 다른 플러그인 실행 격리를 검증한다.

## 3. 웹 클라이언트와 목록 화면

- [x] 3.1 수동 동기화 접수·요청 상태·plugin capability 응답의 런타임 검증과 안전한 오류 정규화를 웹 API client에 추가하고 정상·`403`·`409`·잘못된 JSON·취소·네트워크 테스트를 통과시킨다.
- [x] 3.2 목록 화면에 `지금 동기화` 버튼, 플러그인 활성 대상 전체 범위 안내, 실행 불가 이유, 실행 중·성공·부분 성공·실패 및 마지막 성공 시각을 추가하고 컴포넌트 테스트로 접근 가능한 이름·상태와 기존 목록 보존을 검증한다.
- [x] 3.3 실행 중에만 단일 in-flight polling을 수행하고 terminal 결과에서 cursor 이력과 페이지를 초기화해 첫 목록을 재조회하도록 상태 생명주기를 구현하며 fake timer 테스트로 중복 클릭, polling 중단, route 변경·늦은 응답 폐기와 브라우저 새로고침 상태 복구를 검증한다.
- [x] 3.4 기존 목록 loading/error/pagination 동작과 수동 동기화 상태를 조합하고 `pnpm --filter @oss-scp/web test` 및 build로 기존 목록·상세 route 회귀가 없음을 검증한다.

## 4. 통합 검증 및 문서

- [x] 4.1 API·collector CLI·collection-engine·platform DB 관련 test와 build를 실행해 타입·단위·통합 회귀를 검증하고 실패한 경로를 수정한다.
- [x] 4.2 PostgreSQL과 MySQL Docker 환경에서 정상 수동 동기화, 진행 중 중복 요청, 기동 수집 충돌, 부분/실패 후 기존 데이터 보존과 완료 후 목록 갱신을 자동 검증하도록 integration script/CI를 갱신한다.
- [x] 4.3 서버·클라이언트 문서에 API 계약, 플러그인 전체 실행 범위, 계정관리 비활성 권한 정책, 상태·오류·재시작 제한과 운영 확인 절차를 기록하고 문서의 명령·endpoint를 자동 또는 수동 점검한다.
- [x] 4.4 `openspec validate add-plugin-manual-sync --strict`와 저장소 lint/build/test 범위를 실행하고 결과 및 미검증 항목을 변경 기록에 남긴다.

## Verification Results

- `platform-db` 137 tests, `collection-engine` 34 tests, `collector-cli` 23 tests, API 27 tests, 웹 65 tests 및 웹 production build를 통과했다.
- PostgreSQL과 MySQL `test:integration:sample1`에서 수동 API 접수·완료·DB trigger/request 상관관계와 기존 저장 조회를 검증했다.
- `.codex-worktrees` 아래 사용자의 별도 checkout은 중첩 ESLint 설정으로 기본 `pnpm lint`를 방해하므로 제외했으며, 현재 저장소 범위 lint는 통과했다.
- `openspec validate add-plugin-manual-sync --strict`를 통과했다.
