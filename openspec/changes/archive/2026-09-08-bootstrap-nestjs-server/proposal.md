## Why

이슈 #8의 서버 개발을 시작할 실행 가능한 NestJS 기반이 아직 없다. 개발자는 로컬에서 빠르게 코드를 수정·검증하고, 설치자는 Node.js나 pnpm 없이 Docker로 서버를 실행할 수 있어야 하며, 후속 클라이언트 이슈 #9에는 안정된 상태 확인 API 계약이 필요하다.

## What Changes

- Node.js 24 LTS, TypeScript, pnpm workspace 기반 서버 프로젝트를 추가한다.
- 로컬 개발 실행과 소스 변경 시 자동 재시작을 기본 개발 경로로 제공한다.
- `GET /api/v1/health`가 HTTP 200과 `{"status":"ok"}`를 반환하도록 한다.
- 빌드된 서버를 실행하는 Dockerfile과 서버용 Docker Compose 구성을 제공한다. 호스트의 Node.js·pnpm 설치 및 소스 마운트를 요구하지 않는다.
- 타입 검사·린트·자동화 테스트·빌드·Docker 실행 검증을 GitHub Actions와 실행 문서에 연결한다.
- 공통 개발 문서와 OpenSpec context의 개발용 컨테이너 전제는 구현 단계에서 로컬 개발 기본 방침으로 정합화한다.
- 제외 범위: 클라이언트(#9), 샘플 데이터(#5), DB·Redis·수집·인증·업무 API, 개발용 Docker/HMR 구성, Helm, 레지스트리 공개 및 릴리스 자동화. 이미지 직접 빌드·실행까지 검증하며 공개 이미지 배포는 후속 작업이다.

## Capabilities

### New Capabilities

- `server-bootstrap`: 로컬 서버 개발·검증, 공개 상태 확인 API, Docker 기반 독립 실행과 실행 문서.

### Modified Capabilities

없음. 현재 본 명세에는 기존 capability가 없다.

## Impact

- 관련 이슈: https://github.com/PLS934/oss-scp/issues/8. #9는 이 변경의 workspace 설정과 상태 확인 API를 사용한다.
- 예상 추가 위치: 루트 workspace·잠금 파일·환경변수 예시, `apps/api/`, 루트 Compose·Docker 빌드 제외 설정, `.github/workflows/`.
- 문서 반영 대상: `README.md`, `docs/plans/development-plan.md`, `openspec/config.yaml` 및 서버 실행 가이드. 현재 커밋되지 않은 기존 문서 변경을 보존한다.
- 기존 실행 코드와 CI가 없는 초기 구성으로, 기존 API를 변경하지 않는다. NestJS 및 개발 도구의 정확한 버전은 구현 착수 시 Node.js 24 호환성을 확인하고 잠금 파일에 고정한다.
