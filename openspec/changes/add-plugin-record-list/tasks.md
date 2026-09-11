## 1. 목록 표현과 상태 계약

- [x] 1.1 선언 타입별 formatter와 null·누락·타입 불일치의 `—` 표현을 구현하고 string·number·boolean·datetime 단위 테스트를 통과시킨다.
- [x] 1.2 메뉴의 기본 columns만 순서대로 렌더링하는 공통 `RecordList` 테이블을 구현하고 미선언 `sourceValues`가 DOM에 없는 컴포넌트 테스트를 통과시킨다.
- [x] 1.3 로딩·미수집·정상 빈 결과·수집 중·실패·부분 완료·조회 실패 상태를 구현하고 저장 items 유지 및 안전한 재시도 메시지 테스트를 통과시킨다.

## 2. Cursor와 요청 생명주기

- [x] 2.1 첫 묶음과 `nextCursor` 기반 다음 묶음 교체, 마지막 묶음의 다음 이동 비활성화를 구현하고 중복 없는 요청·표시 테스트를 통과시킨다.
- [x] 2.2 20·50·100·200 묶음 크기 선택과 변경 시 cursor 초기화를 구현하고 새 limit의 첫 요청 URL을 검증하는 테스트를 통과시킨다.
- [x] 2.3 route context 변경과 재요청에서 이전 AbortSignal을 취소하고 늦은 응답을 무시하도록 구현해 경쟁 상태 회귀 테스트를 통과시킨다.

## 3. 라우팅과 브라우저 통합

- [x] 3.1 `App`의 route placeholder를 공통 목록에 연결하고 sample1 및 필드가 다른 플러그인의 직접 URL 렌더링 테스트를 통과시킨다.
- [x] 3.2 브라우저 테스트에 72건 sample1의 첫·다음 묶음, `hasNextPage=false`, 상태 표시와 원천 API 미호출 검증을 추가하고 `pnpm test:browser`를 통과시킨다.

## 4. 문서와 전체 검증

- [x] 4.1 `docs/client-development.md`에 기본 목록 사용·상태·순방향 cursor·제외 범위를 문서화하고 문서의 명령과 실제 구현이 일치하는지 확인한다.
- [x] 4.2 웹 단위 테스트, typecheck, lint, production build와 관련 전체 테스트를 실행하고 모두 통과하는지 확인한다.
