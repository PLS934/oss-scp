## 1. single 실행 설정 계약

- [ ] 1.1 single source schema의 필수 HTTP 실행 한도와 범위·한도 관계 실패 테스트를 먼저 추가하고 `pnpm --filter @oss-scp/plugin-config test`에서 기대한 오류 경로를 확인한다.
- [ ] 1.2 single source 타입·loader와 sample2 설정에 실행 한도를 추가하고 plugin-config test·typecheck 및 기존 offset·로컬 CSV 회귀 검증을 통과시킨다.

## 2. 공유 HTTP 수집 기반

- [ ] 2.1 기존 offset 테스트를 기준으로 제한 본문 수신, JSON 파싱, dot 경로 조회, 레코드 크기 검사와 오류 위치 생성을 방식 독립 내부 단위로 추출하고 `pnpm --filter @oss-scp/http-collector test`로 공개 offset 동작이 유지됨을 확인한다.
- [ ] 2.2 공통 HTTP 기반이 요청·본문 timeout, 호출자 취소, HTTP 상태, 압축 해제 후 응답 한도와 비밀 query·본문 제외를 동일하게 유지하는 회귀 테스트를 통과시킨다.

## 3. HTTP single 실행기

- [ ] 3.1 `collectHttpSingle`의 실패 테스트를 먼저 추가하고, sample2 정의로 정확히 한 번 요청해 153건의 순서·중첩 구조와 `{ test_field6: true }` metadata를 한 번 전달한 뒤 작은 요약을 반환하도록 구현한다.
- [ ] 3.2 sample2와 다른 base URL·요청 경로·목록 및 중첩 metadata 경로를 설정만으로 처리하고 선언하지 않은 응답 값을 전달하지 않는 통합 테스트를 통과시킨다.
- [ ] 3.3 정상 빈 목록은 callback 없이 완료하고, 누락·비배열 목록 경로와 누락 metadata 경로·잘못된 JSON은 전달 전에 `invalid_response` 또는 `invalid_json`으로 실패하는 테스트를 통과시킨다.
- [ ] 3.4 Content-Length 없는 응답과 gzip 응답의 수신 한도, 혼합 목록의 단일 레코드 한도 초과 시 목록 전체 미전달을 검증하는 테스트를 통과시킨다.
- [ ] 3.5 HTTP 오류·요청 및 본문 timeout·요청 및 처리 중 취소·처리 실패를 구분하고 callback 완료를 기다리며 민감한 응답·query를 오류에 노출하지 않는 테스트를 통과시킨다.
- [ ] 3.6 격리된 Node.js 측정에서 큰 유효 single 응답 처리 후 요약이 원천 데이터를 보관하지 않고 허용된 메모리 기준을 만족하는지 검증한다.

## 4. 문서와 전체 검증

- [ ] 4.1 HTTP 수집 문서에 single 설정·API·요약·metadata·빈 결과·제한·오류·취소·메모리 계약과 실행 명령을 추가하고 문서 예제가 현재 공개 타입과 일치하는지 확인한다.
- [ ] 4.2 `pnpm test:http-collector`, plugin-config 테스트·typecheck, 전체 workspace lint·typecheck·test와 `openspec validate add-http-single-collector --strict`를 실행해 모두 통과시킨다.
- [ ] 4.3 `.github/workflows/integration-ci.yaml`의 기존 HTTP 수집 검증 경로가 single 통합 테스트도 실행하는지 확인하고, 누락된 경우 동일 명령을 연결해 CI 구성 검증을 통과시킨다.
