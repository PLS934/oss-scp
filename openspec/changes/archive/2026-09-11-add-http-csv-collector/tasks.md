## 1. HTTP CSV 설정 계약

- [x] 1.1 `plugin-config`에 HTTP CSV source schema, 타입과 내부 definition을 추가하고 유효·누락·형식 혼용·한도 관계 테스트로 검증한다.
- [x] 1.2 HTTP CSV 전용 source loader를 추가해 등록 Connection과 요청·묶음·한도를 결합하고 미등록 Connection 및 기존 JSON·로컬 CSV 회귀 테스트로 검증한다.
- [x] 1.3 mock CSV endpoint용 별도 Connection·샘플 플러그인과 registry 항목을 추가하고 `pnpm validate:plugins`에서 모든 source 정의가 함께 통과하는지 검증한다.

## 2. HTTP CSV 스트리밍 실행

- [x] 2.1 `@oss-scp/http-csv-source` 패키지와 안전한 오류 계약을 추가하고 HTTP 상태, URL query·응답 원문 비노출 테스트로 검증한다.
- [x] 2.2 Node HTTP 응답의 wire 스트림, 지원 압축 해제와 기존 `parseCsv`를 pipeline으로 연결하고 전송·해제 후·레코드 크기 한도 및 Content-Length 불일치 테스트로 검증한다.
- [x] 2.3 CSV 행을 callback 완료에 맞춰 제한된 묶음으로 전달하고 53행의 20·20·13 묶음, 헤더만 있는 입력, 처리 실패와 backpressure 테스트로 검증한다.
- [x] 2.4 timeout, 호출자 취소, 중도 연결 종료, 잘못된 압축·CSV에서 요청·응답·파서 자원을 닫고 완료 요약을 반환하지 않는지 자동화 테스트로 검증한다.

## 3. 통합·문서·회귀 검증

- [x] 3.1 같은 fixture의 로컬·HTTP 수집 결과가 순서와 문자열 값까지 일치하고 다른 경로·헤더·행 수의 CSV API도 설정만으로 처리되는지 통합 테스트로 검증한다.
- [x] 3.2 큰 스트림과 느린 소비자를 사용해 전체 입력에 비례한 heap 누적이 없고 네트워크 읽기가 제한되는지 별도 프로세스 테스트로 검증한다.
- [x] 3.3 HTTP CSV 설정·실행·한도·오류·완료 보장과 Content-Length 없는 원천의 제약을 문서화하고 관련 문서 링크를 갱신한다.
- [x] 3.4 새 패키지를 workspace·CI 검증에 연결하고 전체 `pnpm typecheck`, `pnpm lint`, 관련 단위·통합·기존 JSON·로컬 CSV 테스트를 통과시킨다.
