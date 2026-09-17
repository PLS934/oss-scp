## 1. 설정 계약

- [x] 1.1 검토된 설계에 맞춰 db-postgres 및 PostgreSQL Connection schema·타입·참조 검증을 추가하고 기존 HTTP·CSV와 혼합 registry CLI 테스트를 통과한다.
- [x] 1.2 환경변수/파일 passwordRef 해석을 추가하고 평문·누락·경로 탈출·로그 유출 거부 테스트를 통과한다.
- [x] 1.3 PostgreSQL SQL parser를 선정·고정하고 SELECT/WITH/UNION ALL 허용 및 변경 CTE·다중 문장·SELECT INTO·잠금 거부 테스트를 통과한다.

## 2. 라이브 실행 및 무저장 경계

- [x] 2.1 source-loaders/db.ts와 registry의 라이브 정의를 추가하고 수집 정의와 타입으로 분리됨을 타입 검사와 loader 테스트로 확인한다.
- [x] 2.2 읽기 전용 snapshot, timeout, pool·대기열·행·byte 제한과 취소/rollback 정리를 구현하고 실제 PostgreSQL에서 제한 및 후속 연결 정상 동작을 검증한다.
- [x] 2.3 검색·필터·정렬 SQL을 UNION 결과 바깥에 바인딩하여 적용하고 500행 이후 일치·literal %, _, 역슬래시·null·동률·COUNT/page 일관성 테스트를 통과한다.
- [x] 2.4 1행 1레코드 transform 검증과 범위별 외부 키 상세를 구현하고 중복 키·변형 transform·없는 키·직접 상세 접근 테스트를 통과한다.
- [x] 2.5 기동 수집에서 라이브 소스를 제외하고 수동 CLI에서는 실행 전 거부하며 플랫폼 레코드·관계·수집 이력·checkpoint·lease 쓰기가 없음을 spy와 실제 DB 내용 비교로 검증한다.
- [x] 2.6 예제 watchlist 지정과 메모리 TTL 600초·revision 분리·크기 제한·동시 요청 병합을 구현하고 가상 시계 및 실패/만료 테스트를 통과한다.

## 3. API와 화면

- [x] 3.1 기존 목록 경로의 라이브 분기와 별도 상세 경로, live 응답 타입을 추가하고 HTTP 400/404/503·비활성 범위·비밀 비노출 API 테스트를 통과한다.
- [x] 3.2 선언형 목록·상세에서 라이브 상태와 외부 키 탐색을 연결하고 검색·필터·정렬·번호 페이지·새로고침·원천 실패 브라우저 테스트를 통과한다.
- [x] 3.3 저장형 UUID 상세·cursor·번호형 페이지·수집 상태가 유지됨을 기존 API 및 클라이언트 회귀 테스트로 검증한다.

## 4. 예제·배포·검증

- [x] 4.1 실제 PostgreSQL fixture에 합성 projects/components/sscs와 인덱스·읽기 계정을 구성하고 plugins/dependency-track-db의 UNION ALL SQL·transform·화면·Connection 참조를 작성하여 CLI 검증 및 세 종류 상세 조회를 통과한다.
- [x] 4.2 .github/workflows/integration-ci.yaml에 새 단위·PostgreSQL 통합·브라우저 검증을 연결하고 영향 패키지 lint·타입 검사·빌드와 기존 저장형 검증 결과를 기록한다.
- [x] 4.3 동일 이미지에서 외부 플러그인 SQL·화면을 변경하고 registry 검증/재기동 후 반영됨을 확인해 재빌드 불필요 증거를 남긴다.
- [x] 4.4 secret 주입·원천 SELECT 권한·한도·캐시·예제 스키마·롤백 절차를 문서화하고 실제 운영 DB 검증으로 오해할 표현이 없는지 확인한다.
- [x] 4.5 openspec validate add-live-db-plugin-source --strict를 실행하고 #115 완료 조건별 실제 검증 결과와 남은 제한을 기록한다.
