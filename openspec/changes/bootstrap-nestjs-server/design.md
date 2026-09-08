## Context

저장소에는 애플리케이션·패키지 설정·CI가 없고 OpenSpec 본 명세도 비어 있다. 통합 개발 플랜 §4는 `apps/api`와 `apps/web` 구조를 제안한다. #8은 공통 workspace와 서버를 만들고 #9는 그 위에 클라이언트를 추가한다. 동기는 proposal.md를 따른다.

사용자가 확정한 방향은 로컬 앱 개발과 Docker 배포·간편 실행의 구분이다. 현재 README, 개발 플랜 §9의 컨테이너 설명 및 단계별 목록, OpenSpec context에는 이전 개발용 컨테이너 방향이 남아 있다. 이 change가 최신 합의를 기록하며, 공통 문서 수정은 구현 단계 작업에 포함한다. 기존 미커밋 문서는 다른 변경을 보존하며 필요한 문장만 수정한다.

## Goals / Non-Goals

**Goals:** 개발·배포가 같은 API 계약을 제공하고, #9가 공통 설정을 다시 만들지 않아도 되게 한다. 새 환경에서 실행·검증·정리를 재현할 수 있게 한다.

**Non-Goals:** 빈 공통 패키지를 선제 생성하거나 수집·저장 계층을 도입하지 않는다. 이번 health는 프로세스의 HTTP 처리 가능 여부만 확인한다. 데이터 fixture·초기화·checkpoint·실제 수집처 연결 검증은 해당 기능의 후속 change에서 다룬다.

## Decisions

### 로컬 우선 개발과 workspace

Node.js 24 LTS, pnpm workspace, TypeScript, NestJS를 사용하고 서버를 `apps/api`에 배치한다. 루트 workspace는 `apps/*`, `packages/*`를 수용하되 이번에는 실제 필요한 API 패키지만 만든다. 루트 단일 앱 구성은 #9에서 재구성이 필요하므로 선택하지 않는다.

제안 명령은 루트 `pnpm dev`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm start`이며 현재는 API 패키지로 전달한다. 설치는 `pnpm install --frozen-lockfile`을 사용한다. 개발은 Nest CLI watch, 배포는 컴파일된 JS 실행으로 구분한다. 컨테이너 안에서 개발하는 대안은 사용자의 범위 조정에 따라 제외한다.

NestJS HTTP adapter는 초기 구성 단순화를 위해 Express를 선택한다. Fastify는 현재 성능 요구나 비교 근거가 없어 도입하지 않는다. 테스트는 기존 플랜의 Vitest를 사용하며 Nest의 decorator metadata가 운영 컴파일과 일치하는 변환 구성을 적용한다. HTTP 테스트로 의존성 주입까지 확인하고, 실제 배포 빌드의 기동 검사도 별도로 수행한다.

구현 버전은 Node.js 24.19.0, pnpm 10.34.5, NestJS 11.2.3, Nest CLI 11.0.24, TypeScript 5.9.3, Vitest 4.1.11, ESLint 10.10.0, @eslint/js 10.0.1, typescript-eslint 8.70.0으로 고정했다. 공식 npm 패키지의 engines/peerDependencies에서 Node.js 24 호환 조건을 확인했다. 초기 후보 ESLint 9는 설치 시 지원 종료 안내가 있어 지원 중인 10으로 선택했다. 테스트는 별도 TS 변환기를 추가하지 않고 `nest build`로 생성한 JS를 Vitest에서 읽어 운영과 동일한 decorator metadata와 실제 Nest 의존성 주입을 검증한다.

근거: [NestJS 공식 안내](https://docs.nestjs.com/first-steps), [pnpm 설치·호환성](https://pnpm.io/installation), [Vitest 안내](https://vitest.dev/guide/), 각 고정 버전의 [npm registry](https://registry.npmjs.org/) engines 및 peerDependencies.

### API와 설정

`GET /api/v1/health`는 `{"status":"ok"}`를 반환한다. 인증·외부 서비스 호출·시각·호스트 정보는 필요하지 않다. #9는 개발 서버와 Nginx에서 `/api`를 프록시하며 이 경로를 그대로 보존하도록 문서에 계약을 남긴다. CORS 개방은 이번에 추가하지 않는다.

API는 `HOST` 기본 `127.0.0.1`, `PORT` 기본 `3000`을 사용한다. 이미지에서는 `HOST=0.0.0.0`, `PORT=3000`, `NODE_ENV=production`을 설정한다. `PORT`는 시작 전 1–65535 정수로 검증하고 listen 실패는 원인을 기록한 뒤 비정상 종료한다. 종료 신호는 Nest shutdown hook으로 처리한다.

루트 `.env.example`은 비밀 없는 `HOST`, `PORT`, `API_PORT` 예시를 제공한다. 로컬 실행은 루트 `.env`를 명시적으로 로딩하며 파일이 없어도 기본값으로 실행한다. Compose의 `API_PORT`는 호스트 공개 포트(기본 3000)이고 컨테이너 내부 포트는 3000으로 고정한다. `.env`의 로컬 HOST·PORT는 컨테이너에 무조건 전달하지 않는다.

### 독립 실행 이미지

`apps/api/Dockerfile`을 루트 빌드 context에서 사용하는 다단계 빌드로 구성한다. 빌드 단계에서 잠금 파일로 의존성을 설치·컴파일하고 런타임 단계에는 산출물과 운영 의존성만 포함한다. pnpm 링크가 빌드 경로를 참조한 채 남지 않도록 독립 실행 가능한 패키징을 사용하고 이미지 단독 실행으로 검증한다. 비루트 사용자로 Node를 직접 실행하며 호스트 소스 마운트와 watcher를 사용하지 않는다.

루트 `compose.yaml`의 `api` 서비스는 이 이미지를 빌드·실행한다. 기본 포트 공개는 `127.0.0.1:${API_PORT:-3000}:3000`으로 제한하고 외부 배포 시 공개 주소·프록시 설정을 실행 가이드에서 안내한다. `.dockerignore`는 `.git`, `.env` 및 비밀 설정, 호스트 node_modules와 빌드 출력을 제외한다.

이미지 healthcheck는 내장 Node로 HTTP 상태와 JSON 계약을 확인한다. 간격 10초, 요청 제한 3초, 검사 timeout 5초, 시작 유예 10초, 재시도 3회를 제안한다. curl 같은 추가 런타임 패키지는 필요하지 않다. Compose는 이미지의 검사를 상속한다. 공개 레지스트리 이미지 제공은 이번 완료 조건이 아니며 직접 빌드한 이미지 실행까지 제공한다.

### 검증과 문서

GitHub Actions에서 고정된 도구로 설치·타입 검사·린트·Vitest·빌드를 실행한다. 별도 Docker 검증에서는 Compose 빌드·기동 후 제한 시간 안에 healthy 및 HTTP/JSON 계약을 확인하고 실패 시 로그를 수집한 뒤 항상 정리한다. 포트 설정 오류와 충돌, 미등록 경로, API 정상 응답을 자동화하고, 빌드 JS 실행 및 watcher 변경 반영은 프로세스 수준 검사로 확인한다.

초기 검증 목표는 macOS arm64 로컬 개발 및 Docker linux/arm64, GitHub Actions Ubuntu linux/amd64 로컬 명령 및 Docker다. 실제 실행한 환경만 검증 완료로 보고한다. Windows·다른 아키텍처와 멀티 플랫폼 이미지 배포는 미검증 범위로 명시한다.

실행 가이드는 도구 설치 버전, `.env` 사용, 로컬 개발·빌드 실행, `docker compose up --build -d --wait`, 상태 확인, 로그, `docker compose down`, 이미지 단독 실행을 구분한다. 이번에는 데이터 초기화 명령이 없고 외부 계정이나 샘플 데이터 없이 health를 확인한다고 안내한다.

## Risks / Trade-offs

- [공통 문서의 이전 Docker 개발 방침] → 구현 시 README·개발 플랜·OpenSpec context를 함께 정합화하고 기존의 DB용 선택 Docker 방향과는 구분한다.
- [도구 버전 및 metadata 변환 불일치] → 정확한 버전 고정 전에 설치·컴파일·실제 HTTP 호출을 확인하며 잠금 파일과 CI를 함께 갱신한다.
- [개발 성공과 이미지 성공의 차이] → 호스트 node_modules·소스 볼륨 없이 독립 이미지를 실행해 검증한다.
- [Docker daemon 또는 검증 플랫폼 부재] → 구현은 진행하되 해당 검증을 완료 처리하지 않고 CI 결과나 사용 가능한 환경의 실행 결과를 확보한다.
- [포트 충돌] → 시작 실패를 명확히 표시하고 로컬 PORT와 Compose API_PORT 변경 방법을 문서화한다.

## Migration Plan

기존 애플리케이션과 영속 데이터가 없어 데이터 migration은 없다. 문서와 CI를 포함한 서버 초기 구성을 하나의 변경으로 검증한다. 시험 실행은 Compose 종료로 정리할 수 있고, 병합 후 되돌림이 필요하면 해당 커밋을 revert한다. #9가 API 계약과 workspace에 의존하기 시작한 뒤에는 연관 변경의 영향을 함께 확인한다.
