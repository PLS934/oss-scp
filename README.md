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
export PLATFORM_DB_PASSWORD='무작위로-생성한-로컬-비밀번호'
docker compose up --build -d --wait
docker compose run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js
# 브라우저: http://localhost:8080
curl http://127.0.0.1:3000/api/v1/health
docker compose down
```

상태 확인 API는 `{"status":"ok"}`, DB 준비 API는 `{"status":"ready"}`를 반환합니다. 기본 Compose는 호스트에 DB 포트를 공개하지 않는 전용 PostgreSQL을 함께 실행합니다. 이미 실행 중인 외부 PostgreSQL을 사용하는 방법은 [플랫폼 DB 가이드](docs/platform-db.md)를 참고하세요.

## 기여 방법

- 버그나 기능 제안은 이슈 템플릿에 맞춰 등록해주세요.
- 변경 사항은 PR 템플릿에 맞춰 설명하고, 관련 이슈와 확인 결과를 남겨주세요.

## 원천 데이터 샘플

외부 API·원천 DB·CSV 파일로 제공되는 데이터의 가공·저장·조회 방식을 설계하고 테스트하기 위한 [원천 데이터 샘플](fixtures/README.md)을 제공합니다.

## 원천 Mock API

외부 인증 정보 없이 JSON·CSV 샘플을 HTTP로 제공합니다. [실행 및 테스트 안내](docs/mock-api.md)를 참고하세요. Docker의 `mock` 프로필을 선택할 때만 함께 실행됩니다.

## 샘플 플러그인

sample1 mock API와 로컬 CSV의 입력 정보를 `plugin.json`, `source.json`, Connection으로 분리한 [샘플 플러그인 작성·검증 안내](docs/plugin-development.md)를 제공합니다. 실제 HTTP 수집은 후속 기능이며 현재 JSON source는 설정 계약을 검증하고 로컬 CSV source는 제한된 행 묶음 실행까지 지원합니다.

공통 파서의 형식·오류 계약은 [로컬 CSV 읽기 가이드](docs/local-csv-reader.md), 플러그인 연결·묶음·완료·취소 계약은 [로컬 CSV source 가이드](docs/local-csv-source.md)를 참고하세요.
