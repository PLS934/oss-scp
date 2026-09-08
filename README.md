# oss-scp

오픈소스 취약점 관리 플랫폼입니다.

## 서버 실행

로컬 개발은 Node.js 24.19.0과 pnpm 10.34.5 설치 후 실행합니다.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Docker와 Compose가 설치되어 있다면 Node.js·pnpm 없이 실행할 수 있습니다.

```sh
docker compose up --build -d --wait
curl http://127.0.0.1:3000/api/v1/health
docker compose down
```

상태 확인 API는 `{"status":"ok"}`를 반환합니다. 현재는 서버 실행 기반이며 업무 API·DB·클라이언트는 후속 구현입니다. 환경변수, 검증 및 실행 방법은 [서버 개발·실행 가이드](docs/server-development.md)를 참고해주세요.

## 기여 방법

- 브랜치·PR·클라이언트·서버의 버전 관리 기준은 [브랜치 및 릴리스 전략](docs/development-workflow.md)을 참고해주세요.
- 버그나 기능 제안은 이슈 템플릿에 맞춰 등록해주세요.
- 변경 사항은 PR 템플릿에 맞춰 설명하고, 관련 이슈와 확인 결과를 남겨주세요.
