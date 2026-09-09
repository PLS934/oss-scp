## Context

동기는 proposal.md를 따른다. 최신 main에는 apps/api의 NestJS health API, apps/web, pnpm workspace와 Vitest 기반 HTTP 테스트가 있다. fixtures의 JSON 두 파일과 CSV는 정적 원천 샘플이다. 현재 작업 폴더에서 확인한 개발 계획의 원천·플랫폼 조회 분리와 최소 기능 순서를 적용한다. 해당 개발 계획은 아직 main에 없으므로 이 change는 계획 파일 자체를 추가하지 않는다.

## Goals / Non-Goals

**Goals:** 세 고정 fixture를 안정적으로 제공하고 HTTP 계약을 자동 검증한다.

**Non-Goals:** 업무 모델·유일키 변환·저장·담당자 변경·checkpoint·CSV 파서·공개 이미지 릴리스는 추가하지 않는다. 샘플 서버의 Docker 빌드·실행은 포함한다.

## Decisions

- `apps/mock-api`를 독립 pnpm 패키지로 두고 기존 NestJS·TypeScript·Vitest 버전을 재사용한다. 기존 API에 controller를 넣으면 원천 중단을 별도로 모사하기 어렵고 운영 앱에 샘플을 포함하게 된다. Node HTTP 단독 서버는 의존성이 적지만 기존 서버 테스트·구성 패턴과 차이가 생겨 이번에는 선택하지 않는다.
- 기본 실행은 `pnpm dev:mock`, 빌드 후 실행은 `pnpm start:mock`으로 제공한다. 기본 loopback 포트는 3001, 설정 이름은 MOCK_HOST·MOCK_PORT다. 포트는 십진 정수 1~65535로 검증한다. 이 명령·경로·설정 이름은 이 change에서 제안한 계약이다.
- 경로는 `/sample1`, `/sample2`, `/vulnerabilities.csv`로 고정한다. 빌드 시 세 fixture를 dist/fixtures 아래 같은 상대 구조로 복사하고 실행 파일 기준으로 읽어 cwd에 의존하지 않는다. Docker 이미지에도 같은 빌드 산출물을 포함한다. 개발 모드는 fixture 변경 시 복사와 재시작을 수행한다. 원본 fixture가 유일한 관리 대상이며 복사본은 Git에 넣지 않는다.
- 시작 시 세 fixture를 읽고 JSON의 필수 배열 구조를 검증한다. 작은 고정 샘플만 메모리에 유지하고 실행 중에는 불변 스냅샷을 제공한다. fixture 수정은 재시작 후 반영한다. 대용량 수집 엔진의 메모리 처리 방식을 이 구현으로 결정하지 않는다.
- sample1의 rows를 slice하고 total은 전체 rows 길이로 계산한다. 원본 total과 rows 길이 불일치는 시작 오류다. offset·limit은 숫자 문자열과 안전한 정수를 검증한다. 반복 키와 배열 형태도 거부하며 요청 오류는 HTTP 400 JSON으로 반환한다.
- sample2는 전체 객체를 직렬화해 값과 타입을 보존한다. CSV는 파싱·재생성 없이 Buffer로 반환한다. 고정 경로만 읽고 요청으로 파일 경로를 지정할 수 없게 한다.
- Vitest에서 임시 포트로 실제 HTTP 요청을 보내 원본과 비교한다. 부팅 오류와 종료는 별도 프로세스로 검증한다. 루트 `pnpm test`에 workspace 테스트가 포함되며 CI가 이를 실행한다.
- `apps/mock-api/Dockerfile`은 기존 API와 같은 Node.js 24·pnpm 버전으로 빌드하고 빌드 산출물·운영 의존성·샘플만 런타임에 포함한다. 비루트 사용자로 실행하고 `/sample1?limit=1`을 검사해 health 상태를 제공한다. .dockerignore의 허용 목록에는 mock 빌드 입력과 세 fixture만 추가한다.
- compose.yaml에 `mock-api` 서비스와 `profiles: [mock]`를 추가한다. 별도 Compose 파일보다 기존 네트워크·실행 명령을 재사용하기 쉽고, 항상 기동하는 방식과 달리 기본 실행에 원천 샘플을 요구하지 않는다. 내부 주소는 `http://mock-api:3001`, 호스트 주소는 `http://127.0.0.1:3001`이다. 컨테이너의 MOCK_HOST는 0.0.0.0, MOCK_PORT는 3001로 고정하고 호스트 공개 포트만 MOCK_PUBLISHED_PORT로 변경한다.
- 단독 검증은 `docker compose --profile mock up --build -d mock-api`, 3개 서비스 실행은 `docker compose --profile mock up --build -d`로 제공한다. api·web에 mock-api의 depends_on을 추가하지 않는다. api 컨테이너의 HTTP 호출로 내부 접근을 검증하되 실제 수집 연동을 구현한 것으로 설명하지 않는다.
- compose.dev.yaml은 기존 Dockerfile.dev를 사용해 mock 소스·fixture 변경을 자동 반영한다. 모든 서비스에서 새 mock 패키지의 node_modules가 호스트나 다른 컨테이너와 섞이지 않도록 서비스별 볼륨을 구성한다. 개발 실행은 `docker compose -f compose.yaml -f compose.dev.yaml --profile mock up --build -d`로 제공한다.
- Docker 검증은 이미지 단독 실행·mock 단독 Compose·3개 서비스 동시 실행·컨테이너 간 호출·mock 중단 후 기존 health 경로 유지·개발 변경 반영을 포함한다. 기존 CI의 Docker job에 전용 검사 명령을 추가하고 테스트가 만든 컨테이너와 볼륨을 정리한다.

## Risks / Trade-offs

- 고정 fixture 전체를 메모리에 읽음 → 현재 72·153건과 53행에 한정하며 범용 대용량 서버로 설명하지 않는다.
- fixture 상대 경로가 빌드 과정에서 달라질 수 있음 → 루트 실행·패키지 실행·빌드 후 실행을 검증한다.
- Docker 빌드 컨텍스트에서 fixture가 누락될 수 있음 → 소스 볼륨 없는 이미지 단독 실행에서 JSON 전체 비교와 CSV 바이트 비교를 수행한다.
- mock이 실제 원천의 변경·인증·장애 특성을 모두 재현하지 않음 → 재현 범위를 문서화하고 장애 주입·동적 데이터는 후속 요구로 다룬다.
- Node가 현재 셸 PATH에 없음 → 구현 검증 시 저장소 요구 버전의 런타임을 확인해 실행하며 미실행 검증을 성공으로 보고하지 않는다.

## Migration Plan

DB migration은 없다. 로컬은 pnpm 의존성 설치 후 별도 명령으로 실행하고, Docker는 checkout과 Docker·Compose만으로 빌드·실행한다. 기본 Compose는 api·web을 실행하고 mock 프로필을 선택할 때 mock-api를 함께 실행한다. 되돌릴 때 mock 프로세스 또는 컨테이너를 종료하고 이 change를 되돌리면 된다. 공개 레지스트리·릴리스 설정은 변경하지 않는다.
