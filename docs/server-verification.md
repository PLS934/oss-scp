# 서버 초기 구성 검증 기록

대상: 이슈 #8, OpenSpec `bootstrap-nestjs-server`.

## 실행 환경과 결과

| 검증 | 환경 | 결과 |
|---|---|---|
| 잠금 설치·타입 검사·린트·12개 Vitest 테스트·빌드 | macOS arm64, Node.js 24.19.0, pnpm 10.34.5 | 통과 |
| 실제 배포 실행·포트 변경·잘못된 설정·포트 충돌·종료 | macOS arm64 | 통과 |
| 임시 소스 복사본의 .env 로딩·Nest watch 변경 반영 | macOS arm64 | 통과 |
| Docker 빌드·Compose 기동·호스트 API | Docker linux/arm64 | 통과 |
| 이미지 단독 실행·비루트·볼륨과 개발 파일 제외 | Docker linux/arm64 | 통과 |
| 무응답 HTTP 서버의 healthcheck timeout·unhealthy 전환 | Docker linux/arm64 | 통과 |
| 새 작업 복사본에서 문서 명령 재현 | macOS arm64 / Docker linux/arm64 | 통과 |
| GitHub Actions 로컬 명령 및 Docker 검증 | Ubuntu 24.04 linux/amd64 | 통과 |
| OpenSpec 엄격 검증 | 로컬 CLI | 통과 |

macOS 검증은 Codex가 제공한 Node 실행 파일과 임시 도구 디렉터리에 설치한 pnpm 10.34.5를 사용했다. 전역 개발 환경 설정은 변경하지 않았다. Docker는 실제 실행 중인 엔진을 사용했다. 테스트용 컨테이너·네트워크는 검증 스크립트가 정리하며 `oss-scp-api:local` 이미지는 남는다.

Windows·다른 CPU·Kubernetes·공개 레지스트리 이미지 배포는 검증하지 않았다. 클라이언트·DB·업무 기능은 이번 범위가 아니다.

## CI 실행 근거

[GitHub Actions 실행 34199986008](https://github.com/PLS934/oss-scp/actions/runs/34199986008)에서 커밋 `06e260b4953c530e7ca2b9ce9e21096f093b100b`의 로컬 개발·배포 빌드 및 Docker 빌드·실행 작업이 모두 성공했다. 이후 변경은 이 검증 기록과 OpenSpec 체크리스트 갱신뿐이다.

이슈 #8의 로컬 실행·자동 재시작·HTTP 200 상태 JSON·타입 검사·빌드·Docker 이미지·Compose 실행·실행 가이드 완료 조건을 모두 확인했다. README의 서버 실행 안내와 구현 파일은 작업 브랜치에 커밋했으며, 기존 미커밋 README 개발 방향·공통 OpenSpec 설정·개발 플랜은 로컬에 보존한 상태로 최신 로컬 개발 방침을 반영했다.

## 재현 명령

서버 개발·실행 가이드의 순서로 `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:process`, `bash scripts/test-docker.sh`를 실행한다. `pnpm test`는 HTTP 계약·설정 테스트 12개를 포함하며 프로세스 검사는 별도다.

CI는 `.github/workflows/ci.yaml`의 두 작업으로 위 명령을 실행한다. 작업 실패는 성공으로 처리하지 않으며 Docker 검증 실패 시 컨테이너 로그를 출력하고 정리한다.
