## 1. 독립 생성기와 스킬

- [x] 1.1 `skills/oss-scp-plugin-init`에 도구 중립적 `SKILL.md`, 참조 문서와 자체 완결형 Node.js 생성 CLI를 추가하고, 스킬 폴더만 임시 위치에 복사한 상태에서 실행되는 테스트로 확인한다.
- [x] 1.2 JSON single, JSON offset, CSV file, CSV HTTP 템플릿을 추가해 plugin/source/JavaScript transform, registry, 필요한 Connection과 샘플이 생성되는지 네 유형 테스트로 확인한다.
- [x] 1.3 입력 파싱과 원자적 출력 생성을 구현하고 잘못된 ID/source/인자, 기존 파일·디렉터리·symlink, 생성 실패에서 비정상 종료와 기존 데이터 보존을 자동 테스트로 확인한다.
- [x] 1.4 생성된 네 transform을 실제 공통 transform 실행 경로로 호출해 선언된 `item` 레코드와 유일키가 만들어지는지 자동 테스트로 확인한다.

## 2. 대상 플랫폼 검증

- [x] 2.1 같은 revision의 기존 `plugin-config` preflight를 직접 사용하는 개발 테스트 경로를 추가하고, 네 생성 유형의 성공 및 잘못된 필드 참조·transform export 실패 테스트로 확인한다.
- [x] 2.2 버전 또는 digest 고정 이미지와 로컬 존재를 요구하고 `--pull=never`, `--network=none`, `--read-only`, 읽기 전용 bind mount로 기존 검증기를 실행하는 Docker 경로를 추가하며 명령 계약 테스트로 확인한다.
- [x] 2.3 이미지 미지정, `latest`·고정되지 않은 이미지, 로컬에 없는 이미지가 성공으로 보고되지 않는지 실패 테스트로 확인한다.
- [x] 2.4 `--platform-root` 호스트 실행을 제거해 고정 이미지 격리를 안전 기본값이자 유일한 검증 경로로 만들고, 악성 checkout과 파일·symlink·경로 구성요소 교체가 실행되지 않는 회귀 테스트로 TOCTOU 제거를 확인한다.

## 3. 문서와 CI 연결

- [x] 3.1 GitHub release tag 또는 commit ref 고정 설치, Codex·Claude Code 설치 위치, AI 없이 쓰는 CLI, 플랫폼 버전 정합, 첫 수집 절차와 검증 한계를 문서화하고 README 및 기존 플러그인 개발 문서 링크 검사를 통과시킨다.
- [x] 3.2 루트 package script와 `.github/workflows/integration-ci.yaml`에 생성·로컬 검증 테스트를 연결하고 workflow 계약 테스트로 실행 명령의 존재를 확인한다.
- [x] 3.3 현재 revision의 API 이미지를 대상으로 네 유형의 성공과 손상 설정 실패를 확인하는 Docker 테스트를 추가하고 통합 CI Docker job에서 실행되도록 검증한다.

## 4. 완료 검증

- [x] 4.1 관련 생성·검증·Docker 테스트, `pnpm lint`, 필요한 build/test, 문서 링크 검사와 `git diff --check`를 실행해 모두 통과시킨다.
- [x] 4.2 `openspec validate add-plugin-init-skill --strict`를 실행하고 모든 구현 작업을 완료 표시한 뒤 변경 diff가 GitHub #109 범위와 제외 조건을 지키는지 확인한다.
