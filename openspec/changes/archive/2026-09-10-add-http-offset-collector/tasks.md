## 1. Source 실행 한도 계약

- [x] 1.1 `source-v1` schema와 TypeScript 설정/내부 정의에 timeout·응답·단일 레코드 바이트 한도를 추가하고 경계값 및 레코드≤응답 교차 검증 테스트로 확인한다.
- [x] 1.2 sample1 source에 5,000 ms·2 MiB·256 KiB 한도를 명시하고 기존 플러그인 검증 명령이 새 내부 정의를 반환하는지 확인한다.

## 2. HTTP offset 수집 코어

- [x] 2.1 프레임워크 독립 `packages/http-collector` workspace 패키지와 공개 타입·오류 코드를 구성하고 build·typecheck가 통과하는지 확인한다.
- [x] 2.2 URL query에 설정된 offset·limit을 안전하게 결합하고 dot 경로로 items/total을 해석하여 sample1 및 다른 주소·경로 테스트가 통과하도록 구현한다.
- [x] 2.3 total 고정, 기대 페이지 건수, 조기 빈 목록과 마지막 부분 묶음 종료를 검증하고 72건이 20·20·20·12 순서로 전달되는 테스트로 확인한다.
- [x] 2.4 각 callback 성공 후에만 다음 요청을 수행하고 처리 완료 묶음을 누적하지 않도록 구현하여 느린 처리·처리 실패 시 요청 횟수 테스트로 확인한다.

## 3. 자원 제한과 실패 처리

- [x] 3.1 Web Stream을 제한된 크기로 읽고 압축 해제 후 응답 바이트와 JSON 재직렬화 레코드 바이트를 검사하여 chunked·gzip·대형·정상/초과 혼합 페이지 테스트로 확인한다.
- [x] 3.2 HTTP 상태, 잘못된 JSON/경로/total, total 변경과 건수 불일치를 비밀정보 없는 안정적 오류 코드로 반환하고 각 실패 뒤 추가 요청·callback이 없는지 확인한다.
- [x] 3.3 요청별 timeout과 호출자 취소를 결합하고 reader 정리·callback signal·처리 실패 전파를 구현하여 요청/본문/처리 단계별 중단 테스트로 확인한다.

## 4. 통합·성능·문서 검증

- [x] 4.1 실제 loopback mock API를 사용한 sample1 통합 테스트와 별도 일반화 API 테스트를 workspace test에 연결하고 외부 자격증명 없이 통과하는지 확인한다.
- [x] 4.2 Node.js 24 `--expose-gc` 격리 프로세스에서 고정 묶음의 작은 실행과 10배 페이지 실행을 비교하고 peak heap 증가분이 설계 기준 이내인지 CI 테스트로 확인한다.
- [x] 4.3 수집 API, source 한도, 실행 명령, 종료·오류·취소 규칙, offset 원천 변경 제약과 후속 가공→저장→checkpoint 연결 경계를 문서화하고 문서의 명령을 깨끗한 설치 상태에서 실행해 검증한다.
- [x] 4.4 변경 패키지와 전체 workspace의 lint·typecheck·test를 실행하고 `openspec validate add-http-offset-collector --strict`로 구현 및 명세 일관성을 확인한다.
