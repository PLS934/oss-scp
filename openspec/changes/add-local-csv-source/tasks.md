## 1. Source 계약과 설정 로딩

- [x] 1.1 `source.schema.json`과 TypeScript 타입을 JSON offset/로컬 CSV 판별 union으로 확장하고 유효·혼용·경로 이탈·한도 오류 schema 테스트를 통과시킨다.
- [x] 1.2 설정 로더가 로컬 CSV 경로를 설정 루트 안의 절대 경로로 안전하게 해석하고 형식별 내부 정의를 반환하게 하며 기존 sample1 정의 회귀 테스트를 통과시킨다.

## 2. 로컬 CSV 실행

- [x] 2.1 `csv-reader`와 `plugin-config` 정의를 조합하는 로컬 CSV source 실행 패키지를 추가하고 workspace 빌드·타입 검사를 통과시킨다.
- [x] 2.2 묶음 크기 제한, 문자열·행 순서 보존, 마지막/빈 완료 묶음과 다른 헤더 구조를 자동 테스트로 검증한다.
- [x] 2.3 파일·파싱·변경·한도 오류를 보존하고 AbortSignal 취소와 느린 소비/조기 종료 시 자원 해제 및 불완전 완료 방지를 자동 테스트로 검증한다.

## 3. 샘플과 통합 검증

- [x] 3.1 `fixtures/csv/vulnerabilities.csv`를 참조하는 로컬 CSV 샘플 플러그인과 registry 항목을 추가하고 플러그인 검증 출력에 기존 sample1과 새 정의가 함께 포함되는지 확인한다.
- [x] 3.2 등록 정의에서 CSV 실행을 호출하는 통합 검증으로 53행·6필드, 중복·누락 없음, `10.0`·`0.10`과 인용 쉼표·줄바꿈 보존을 확인한다.
- [x] 3.3 새 workspace 패키지의 Docker 개발용 전용 node_modules 볼륨을 세 서비스에 추가하고 `pnpm test:docker:workspace` 검사를 통과시킨다.

## 4. 문서와 전체 품질 검사

- [x] 4.1 지원 CSV 형식, 기본/설정 가능 크기와 묶음 한도, 설정 루트 경로 제약, 완료·오류·취소 의미, 실행 명령과 제외 범위를 문서화하고 예제가 실제 설정과 일치하는지 확인한다.
- [x] 4.2 `openspec validate add-local-csv-source --strict`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, plugin-config 프로세스 검증을 실행해 전체 회귀가 없는지 확인한다.
