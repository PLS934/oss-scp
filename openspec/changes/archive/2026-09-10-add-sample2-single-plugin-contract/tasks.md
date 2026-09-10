## 1. single source 계약 확장

- [x] 1.1 source JSON Schema를 offset·single 판별형으로 확장하고, 유효한 두 방식과 single의 필수값 누락·추가 속성·잘못된 타입/버전/경로를 단위 테스트로 검증한다.
- [x] 1.2 공개 source 및 내부 수집 정의 TypeScript 타입을 판별 가능한 union으로 확장하고 `pnpm --filter @oss-scp/plugin-config typecheck`로 방식별 필드 접근을 검증한다.
- [x] 1.3 설정 로더가 offset 출력은 그대로 유지하면서 single 출력에는 요청·목록 경로와 `{ type: "single" }`만 반환하도록 구현하고 두 방식의 해석 테스트를 통과시킨다.
- [x] 1.4 공통 source dispatcher와 타입 정의에서 offset·single 전용 loader 및 JSON Schema 파일을 분리하고 기존 단위 테스트·typecheck로 외부 정의 출력이 유지되는지 확인한다.
- [x] 1.5 선행 반영된 로컬 CSV source를 file 전용 loader로 분리하고 설정·출력·프로세스 회귀 테스트를 유지한다.

## 2. sample2 플러그인 등록과 일반성 검증

- [x] 2.1 기존 sample1 Connection과 source 참조를 `mock-api-sample1`로 이름 변경하고, `plugins/sample2-single-api`와 `mock-api-sample2` Connection을 등록한 뒤 두 ID와 `127.0.0.1:3001`·`127.0.0.1:3002`가 대칭적으로 해석되는지 확인한다.
- [x] 2.2 Connection 이름 변경 외에 sample1 식별 정보·요청·응답·offset 정의가 동일하게 유지되며 sample2가 별도 Connection에서 `/sample2`, GET, `items`, single로 해석되는지 회귀 테스트로 확인한다.
- [x] 2.3 sample2 Connection만 다른 주소로 변경하는 테스트와 경로·JSON 목록 위치가 다른 임시 single 플러그인 테스트를 추가해 Connection 독립성 및 sample2 값의 비고정성을 확인한다.
- [x] 2.4 누락된 source·Connection 참조와 여러 파일 오류 보고가 sample2 독립 Connection 등록 후에도 파일·JSON 경로를 명시하고 비밀 값을 노출하지 않는지 기존 오류 테스트를 확장해 확인한다.

## 3. 문서와 통합 검증

- [x] 3.1 플러그인 개발 문서에 sample2 전용 Connection·3002 포트, single 설정, 두 내부 정의의 예상 출력과 원천 응답 보존 경계를 추가하고 실제 HTTP 호출·가공은 후속 범위임을 명시한다.
- [x] 3.2 `pnpm validate:plugins`, 플러그인 설정 단위·프로세스 테스트, typecheck와 lint를 실행해 기존 CI 명령이 서로 다른 Connection의 sample1·sample2 설정을 모두 검증하는지 확인한다.
- [x] 3.3 3001과 `MOCK_PORT=3002`의 mock API 프로세스를 각각 직접 호출해 두 API 응답을 확인하고, 추적되지 않은 파일을 제외한 깨끗한 임시 저장소 복사본에서 문서화된 설치·검증 명령이 성공하는지 확인한다.
