# oss-scp

오픈소스 취약점 관리 플랫폼입니다.

## 릴리스 상태

첫 공개 개발 릴리스 목표는 폐쇄망 단일 서버에서 평가할 수 있는 `0.1.0` 기술 프리뷰입니다. 0.1.0은 운영 안정판이나 장기 지원 버전이 아니며, 오프라인 설치·업데이트·복구와 핵심 수집·저장·조회 흐름의 릴리스 게이트를 모두 통과한 뒤 공개합니다. 현재 지원 목표, 제외 기능과 검증 기준은 [브랜치 및 릴리스 전략](docs/development-workflow.md#010-기술-프리뷰)을 참고하세요. 첫 정식 릴리스 목표는 `1.0.0`입니다.

GitHub Release에서 번들을 선택하고 무결성을 검증하는 방법은 [릴리스 설치 가이드](docs/release-installation.md)를, 압축 해제 후 설치·업데이트·복구 절차는 [폐쇄망 번들 가이드](docs/offline-bundle.md)를 참고하세요.

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
docker compose build
docker compose up -d --wait postgres
docker compose run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js
docker compose up -d --wait api web
# 브라우저: http://localhost:8080
curl http://127.0.0.1:3000/api/v1/health
docker compose down
```

상태 확인 API는 `{"status":"ok"}`, DB 준비 API는 `{"status":"ready"}`를 반환합니다. 기본 Compose는 호스트에 DB 포트를 공개하지 않는 전용 PostgreSQL을 함께 실행합니다. MySQL 내장 설치는 `compose.mysql.yaml`을 사용합니다. 외부 PostgreSQL/MySQL 연결 방법은 [플랫폼 DB 가이드](docs/platform-db.md)를 참고하세요.

## 기여 방법

- 버그나 기능 제안은 이슈 템플릿에 맞춰 등록해주세요.
- 변경 사항은 PR 템플릿에 맞춰 설명하고, 관련 이슈와 확인 결과를 남겨주세요.

## 원천 데이터 샘플

외부 API·원천 DB·CSV 파일로 제공되는 데이터의 가공·저장·조회 방식을 설계하고 테스트하기 위한 [원천 데이터 샘플](fixtures/README.md)을 제공합니다.

## 원천 Mock API

외부 인증 정보 없이 JSON·CSV 샘플을 HTTP로 제공합니다. [실행 및 테스트 안내](docs/mock-api.md)를 참고하세요. Docker의 `mock` 프로필을 선택할 때만 함께 실행됩니다.

## 샘플 플러그인

sample1·sample2 mock API와 로컬·HTTP CSV의 입력 정보를 `plugin.json`, `source.json`, Connection으로 분리한 [샘플 플러그인 작성·검증 안내](docs/plugin-development.md)를 제공합니다. 샘플의 TypeScript 가공 코드는 동일한 공통 엔진에서 레코드 단위로 실행·검증됩니다. JSON HTTP source는 offset·single 실행을 지원하며 로컬·HTTP CSV source는 공통 파서의 제한된 행 묶음 실행을 지원합니다.

공통 파서의 형식·오류 계약은 [로컬 CSV 읽기 가이드](docs/local-csv-reader.md), 파일 획득은 [로컬 CSV source 가이드](docs/local-csv-source.md), 다운로드 획득은 [HTTP CSV source 가이드](docs/http-csv-source.md)를 참고하세요.

## 첫 플러그인 만들기

[GitHub 설치형 플러그인 초기 설정 스킬](docs/plugin-init-skill.md)로 별도 작업 폴더에서 시작할 수 있습니다. Codex·Claude Code 설치 안내와 AI 없이 사용하는 생성·검증 CLI를 제공합니다.
