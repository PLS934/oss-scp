## 1. CLI dependency와 collector 연결

- [x] 1.1 collector CLI에 HTTP CSV source의 runtime·prebuild 의존성을 추가하고 lockfile 및 package build로 해석을 검증한다.
- [x] 1.2 HTTP CSV 정의를 선택해 제한된 묶음을 공통 collection engine 계약으로 변환하고 collector 단위 테스트에서 여러 묶음과 완료 metadata를 검증한다.

## 2. Checkpoint와 실패 안전성

- [x] 2.1 numeric checkpoint 이전의 HTTP CSV 행을 묶음 경계 안팎에서 건너뛰고 단위 테스트로 중복·누락 없는 재개를 검증한다.
- [x] 2.2 잘못된 checkpoint, 취소와 묶음 처리 실패가 성공으로 완료되지 않고 미확정 checkpoint를 진행하지 않는지 회귀 테스트로 검증한다.

## 3. 공통 실행 경로 통합 검증

- [x] 3.1 실제 mock API와 플랫폼 DB를 사용한 CLI 통합 검사에서 `vulnerabilities-http-csv`의 여러 묶음 저장과 재개 결과를 검증한다.
- [x] 3.2 Docker 검증에서 HTTP CSV 수동 CLI와 API 기동 수집이 같은 이미지의 공통 경로로 성공하는지 확인하고 CI 실행 경로에 연결한다.

## 4. 문서와 전체 검증

- [x] 4.1 수동 CLI 문서에 HTTP CSV 실행·checkpoint 재개·원천 순서 안정성 조건을 기록하고 명령 예시를 확인한다.
- [x] 4.2 영향받는 package build·typecheck·test, lint, OpenSpec strict validation과 관련 Docker 검증을 실행해 모두 통과하는지 확인한다.
