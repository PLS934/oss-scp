## 1. 구현

- [x] 1.1 공통 패키지와 의존성을 구성하고 frozen-lockfile 설치·빌드를 검증한다.
- [x] 1.2 재사용 파서의 문자열·형식·크기 제한과 로컬 파일 오류·변경 감지·자원 정리를 테스트로 검증한다.

## 2. 검증과 문서

- [x] 2.1 53행 샘플, 청크 경계, 대량·대형·혼합 입력, 중단 후 처음부터 재읽기를 자동 테스트한다.
- [x] 2.2 실행 문서와 README 링크를 제공하고 문서 명령·전체 재귀 검사·OpenSpec strict 검증 결과를 기록한다.

## 검증 결과

2026-09-10, macOS arm64·Node.js 24.20.0·pnpm 10.34.5에서 확인했다.

- 새 worktree에서 frozen-lockfile 설치 성공.
- CSV 25개 포함 전체 101개 테스트 통과.
- pnpm typecheck, pnpm lint, pnpm test, pnpm build 통과.
- 문서 샘플 명령에서 첫 행의 10.0·0.10 문자열과 count 53 확인.
- openspec validate add-local-csv-reader --strict 및 git diff --check 통과.
- GitHub Actions 재귀 검사에 포함됨을 확인했다. 원격 CI·Docker 실행은 이번 작업에서 수행하지 않았다.
