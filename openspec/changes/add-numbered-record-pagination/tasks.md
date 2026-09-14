## 1. 공통 조회 계약

- [x] 1.1 query.ts에 번호형 입력·응답 타입과 page/cursor 상호 배타·안전 정수 검증을 추가하고 query 단위 테스트로 기본값·경계·기존 cursor 호환성을 확인한다.
- [x] 1.2 번호형 페이지의 레코드 수를 유지하는 요약 예산 처리를 추가하고 200건·큰 필드·metadata 한도 fixture로 누락 없음과 실패 계약을 검증한다.

## 2. 저장소와 API

- [x] 2.1 PostgreSQL에 동일 읽기 snapshot의 count·LIMIT/OFFSET·페이지 보정을 구현하고 DB 계약 테스트로 동률 시각·빈 결과·초과 페이지·부분 마지막 페이지를 검증한다.
- [x] 2.2 MySQL에 동일 계약을 구현하고 공통 fixture 및 두 DB 비교로 정렬·메타데이터 일치를 검증한다. transaction 실패 시 rollback과 연결 정리도 확인한다.
- [x] 2.3 record-query service/controller에 page를 전달하고 server.test.mjs로 page 문법·중복 입력·cursor 혼합·안전 오류와 기존 익명 cursor/detail 응답을 검증한다.

## 3. 웹 조회와 탐색

- [x] 3.1 records.ts의 번호형 호출 및 응답 검증을 추가하고 records.test.ts로 URL·잘못된 메타데이터·모드 불일치·취소 및 cursor 회귀를 검증한다.
- [x] 3.2 record-list.tsx에 번호형 이동·최대 10개 번호 구간·페이지 크기·처음/마지막 상태를 구현하고 record-list.test.tsx로 1/10/11/마지막·0건·20/50/100/200건을 검증한다.
- [x] 3.3 route path와 조회 범위·크기 변경의 초기화, 요청 취소·늦은 응답 무시·실패 후 재시도 및 서버 page 보정을 구현하고 비동기 회귀 테스트로 마지막 성공 목록 보존을 검증한다.

## 4. 통합 검증과 문서

- [x] 4.1 scripts/test-browser.mjs를 확장해 번호 클릭·처음/마지막·크기 변경·키보드·aria-current 및 요청 경합을 검증하고 기존 CI browser job이 이를 실행하는지 확인한다.
- [x] 4.2 기존 CI PostgreSQL·MySQL 계약 job에 번호형 시나리오가 포함되는지 확인하고 관련 빌드·타입 검사·린트·단위·DB 통합·브라우저 결과를 기록한다. 필요한 경우 integration-ci.yaml 실행 명령을 수정한다.
- [x] 4.3 개발 문서에 page API, 빈 결과·보정·요약 생략·요청 간 데이터 변경 및 서버/웹 동시 배포 조건을 반영하고 명세와 예제의 일치를 확인한다.
- [ ] 4.4 #87/#74의 준비된 브랜치를 임시 통합 환경에서 조합해 행 이동·번호형 조회·두 테마의 표시와 접근성을 검증한다. 각 이슈 PR diff에 다른 이슈 구현이 섞이지 않았는지 확인한다.
- [ ] 4.5 최신 main을 다시 확인하고 저장소 PR 템플릿에 #86 해결 범위·실제 검증·미검증 항목을 작성한다. 별도 PR 하나를 게시하고 본문 및 base diff를 확인한다.
