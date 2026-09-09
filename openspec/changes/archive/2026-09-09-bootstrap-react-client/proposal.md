## Why

이슈 #9는 개발자가 클라이언트 개발을 시작하고 일반 사용자가 브라우저에서 앱과 서버 연결을 확인할 수 있는 실행 기반을 요구한다. 현재 pnpm workspace에는 NestJS 서버만 있으므로 React 개발 환경과 Docker 통합 실행 경로를 추가한다.

## What Changes

- `apps/web`에 TypeScript + React + Vite 프로젝트와 최소 한국어 시작 화면을 추가한다.
- 기존 `GET /api/v1/health` 계약을 사용해 로딩·연결 성공·연결 실패를 표시하고 서버가 없어도 시작 화면을 제공한다.
- 로컬 Vite HMR과 API 프록시, 배포용 React 정적 파일을 제공하는 Nginx Dockerfile과 API 프록시를 구성한다.
- Docker에서 소스를 연결해 Vite HMR과 NestJS watch로 클라이언트·서버 수정 사항을 자동 반영하는 개발 실행을 추가한다. 기존 배포 이미지 실행도 유지한다.
- `compose.yaml`은 배포용 실행에 사용하고 `compose.dev.yaml`을 함께 적용하면 Docker 개발을 실행하도록 구성한다.
- 배포용 웹 서버는 다른 컴퓨터에서도 실행 호스트의 IP와 웹 포트로 접속할 수 있도록 구성한다. 로컬·Docker 개발 화면은 실행한 컴퓨터에서만 접속하도록 한다. API는 동일 출처 프록시로 연결한다.
- Compose에 웹 서비스를 추가하고 클라이언트·서버 통합 검증 및 클라이언트 자동화 검사를 CI에 포함한다.
- 통합 CI 파일은 `.github/workflows/integration-ci.yaml`, Actions 표시 이름은 `서버·클라이언트 통합 검증`으로 정리한다.
- 잠금 파일과 환경변수 예시, 로컬 개발·이미지 빌드·통합 실행·종료 방법을 갱신한다.
- 업무 화면, 로그인·인증, 자산 조회, 샘플 데이터(#5), JSON 화면 renderer, Helm, 이미지 공개 및 릴리스 자동화는 제외한다. 사내 인프라를 실행 전제로 삼지 않는다.

## Capabilities

### New Capabilities
- `client-bootstrap`: 로컬·Docker 개발과 클라이언트 HMR·서버 변경 반영, 상태 확인 화면, Docker 정적 파일 제공과 API 프록시, 재현 가능한 통합 검증 및 문서.

### Modified Capabilities
없음. 기존 `server-bootstrap`의 API·직접 실행·상태 검사 계약은 유지한다.

## Impact

- 관련 이슈: https://github.com/PLS934/oss-scp/issues/9. 서버 의존성 #8의 계약은 현재 `apps/api` 구현과 본 명세에서 확인했다.
- 신규 `apps/web`, 루트 package scripts·잠금 파일·ESLint·Docker 빌드 허용 목록, Compose·환경변수 예시, CI·검증 스크립트, README·개발 문서에 영향이 있다.
- React·Vite 및 클라이언트 테스트 도구 의존성을 추가한다. 기존 Node.js 24.19.0·pnpm 10.34.5 기준에서 호환 버전을 확인하고 고정한다.
- 서버 API와 공통 데이터 schema 변경은 없다. DB·외부 시스템 자격증명이 필요하지 않으며 기존 서버 개발 명령을 보존한다.

- 2026-09-09 사용자 확인으로 Docker 개발 중 코드 변경 자동 반영을 범위에 추가했다. 개발 플랜과 OpenSpec 설정에도 이 계획을 반영하며 실제 실행 안내는 구현 시 검증 결과와 함께 갱신한다.
