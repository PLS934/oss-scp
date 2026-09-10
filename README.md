# oss-scp

오픈소스 취약점 관리 플랫폼입니다.

## 실행

로컬 개발은 Node.js 24.19.0과 pnpm 10.34.5 설치 후 실행합니다.

```sh
pnpm install --frozen-lockfile
pnpm dev
# 별도 터미널에서 클라이언트 실행
pnpm dev:web
```

로컬 개발 화면은 `http://localhost:5173`에서 확인합니다.

Docker와 Compose가 설치되어 있다면 Node.js·pnpm 없이 실행할 수 있습니다.

```sh
docker compose up --build -d --wait
# 브라우저: http://localhost:8080
curl http://127.0.0.1:3000/api/v1/health
docker compose down
```

상태 확인 API는 `{"status":"ok"}`를 반환합니다. 시작 화면에서 서버 연결 상태를 확인할 수 있으며 업무 API·DB·샘플 데이터는 후속 구현입니다. Docker 개발과 배포의 차이, 외부 접속 및 클라이언트 검증은 [클라이언트 개발·실행 가이드](docs/client-development.md)를 참고해주세요. 서버 환경변수, 검증 및 실행 방법은 [서버 개발·실행 가이드](docs/server-development.md)를 참고해주세요.

## 기여 방법

- 버그나 기능 제안은 이슈 템플릿에 맞춰 등록해주세요.
- 변경 사항은 PR 템플릿에 맞춰 설명하고, 관련 이슈와 확인 결과를 남겨주세요.

## 원천 데이터 샘플

외부 API·원천 DB·CSV 파일로 제공되는 데이터의 가공·저장·조회 방식을 설계하고 테스트하기 위한 [원천 데이터 샘플](fixtures/README.md)을 제공합니다.

## 원천 Mock API

외부 인증 정보 없이 JSON·CSV 샘플을 HTTP로 제공합니다. [실행 및 테스트 안내](docs/mock-api.md)를 참고하세요. Docker의 `mock` 프로필을 선택할 때만 함께 실행됩니다.

## 샘플 플러그인

sample1 mock API의 호출 정보를 `plugin.json`, `source.json`, Connection으로 분리한 [샘플 플러그인 작성·검증 안내](docs/plugin-development.md)를 제공합니다. 실제 HTTP 수집은 후속 기능이며 현재는 설정 계약과 참조를 검증합니다.
