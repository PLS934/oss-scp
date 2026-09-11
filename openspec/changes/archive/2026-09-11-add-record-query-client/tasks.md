## 1. 클라이언트 계약과 요청 구현

- [x] 1.1 `apps/web/src/records.ts`에 JSON 값, 목록·상세 응답, 입력, 판별 가능한 성공·오류 결과 공개 타입을 추가하고 `pnpm --filter @oss-scp/web typecheck`로 확인한다.
- [x] 1.2 목록 필수 입력·허용 limit과 상세 UUID를 fetch 전에 검증하고, 상대 경로와 안전한 query/path 인코딩으로 첫·후속 목록 및 상세 요청을 구현해 URL·무호출 단위 테스트로 확인한다.

## 2. 응답 검증과 오류·취소 처리

- [x] 2.1 레코드·요약·pageInfo·collection·lastStoredAt의 런타임 검증을 구현하고 정상·빈·미수집·추가 필드·잘못된 JSON/필드 테스트로 확인한다.
- [x] 2.2 서버 상태·제한된 오류 코드를 `INVALID_CURSOR`, `NOT_FOUND`, `NOT_READY`, `API_ERROR`로 안전하게 매핑하고 네트워크·AbortSignal 실패를 `NETWORK_ERROR`, `ABORTED`로 구분해 단위 테스트로 확인한다.

## 3. 문서와 전체 검증

- [x] 3.1 `docs/client-development.md`에 함수 사용법, 동일 출처 경계, 오류·취소 처리와 검색·필터·정렬 등 제외 범위를 문서화하고 API 문서와 일치하는지 검토한다.
- [x] 3.2 클라이언트 테스트·타입 검사·빌드와 저장소 lint, 기존 웹 테스트, `openspec validate add-record-query-client --strict`를 실행해 회귀가 없음을 확인한다.
