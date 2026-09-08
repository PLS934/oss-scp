## 1. 개발 기반 구성

- [x] 1.1 Node.js 24와 NestJS·pnpm·TypeScript·Vitest·린트 도구의 공식 호환 조건을 확인하고 정확한 버전을 선택한다. design.md와 런타임 안내에 선택 버전·근거를 기록해 완료를 확인한다.
- [x] 1.2 1.1에 따라 루트 pnpm workspace, `apps/api`, TypeScript·Nest 설정, packageManager·잠금 파일·gitignore를 추가한다. 새 의존성 디렉터리에서 `pnpm install --frozen-lockfile`이 성공하는지 확인한다.
- [x] 1.3 로컬 개발·타입 검사·린트·테스트·빌드·배포 실행 스크립트와 비밀 없는 `.env.example`을 추가한다. 루트 명령이 API 패키지를 실행하고 `.env`가 없어도 기본 설정을 사용하는지 확인한다.

## 2. 서버 동작과 자동화 테스트

- [x] 2.1 1번 완료 후 인증 없는 `GET /api/v1/health`를 구현하고 Vitest HTTP 테스트로 200·정확한 JSON·콘텐츠 유형 및 미등록 경로의 404를 검증한다. 테스트 변환에서도 Nest 의존성 주입이 동작하는지 확인한다.
- [x] 2.2 HOST·PORT 설정 로딩, 포트 검증, 시작 실패 처리와 종료 신호 처리를 구현한다. 기본값·사용자 지정 포트·잘못된 값·포트 충돌의 정상/비정상 종료를 자동화 테스트로 확인한다.
- [x] 2.3 Nest CLI의 기존 watch 기능으로 개발 명령을 구성한다. 격리된 임시 작업 복사본에서 유효한 소스 수정 후 수동 재실행 없이 응답이 바뀌는 프로세스 검사를 추가하고 종료·정리까지 확인한다. 변경 감지 기능을 직접 구현하지 않는다.
- [x] 2.4 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`를 실행하고 컴파일된 JS를 `pnpm start`로 실행해 동일한 health 계약을 확인한다.

## 3. Docker 독립 실행

- [x] 3.1 2번의 빌드·실행 경로를 사용하는 다단계 `apps/api/Dockerfile`과 루트 `.dockerignore`를 추가한다. 이미지 빌드 성공, 비루트 실행, 런타임 의존성 포함, 호스트 소스·node_modules·비밀 파일 제외를 확인한다.
- [x] 3.2 제한 시간을 가진 이미지 healthcheck와 루트 `compose.yaml`의 api 서비스·API_PORT 설정을 추가한다. `docker compose config`와 빌드·기동 후 healthy 상태 및 호스트 HTTP/JSON 응답을 확인한다.
- [x] 3.3 소스 볼륨과 호스트 Node.js·pnpm 없이 이미지 단독 실행을 검증한다. 사용자 지정 호스트 포트, 무응답 시 unhealthy 전환을 확인하고 테스트용 컨테이너를 정리한다.

## 4. CI와 문서 정합화

- [x] 4.1 2·3번의 검증을 GitHub Actions에 연결한다. 잠금 설치·타입 검사·린트·테스트·빌드·빌드 JS 기동·watch 검사 및 Docker 기동/API 검증 결과가 작업 상태에 반영되고, 실패 로그 수집과 항상 실행되는 정리가 구성되었는지 확인한다.
- [x] 4.2 서버 실행 가이드와 README 링크를 추가한다. 정확한 도구 버전, 환경변수, 로컬 개발, 빌드 실행, Docker 빌드·Compose·이미지 단독 실행, 외부 공개 설정, 확인·종료·정리 명령을 포함하고 문서 명령과 CI를 대조한다. 샘플 초기화는 #5 및 후속 연동 범위이며 이번에는 필요하지 않다고 명시한다.
- [x] 4.3 기존 미커밋 변경을 보존하면서 README·개발 플랜의 개발용 컨테이너 설명 및 단계별 목록·OpenSpec context를 로컬 앱 개발 기본 방향으로 맞춘다. DB용 선택 Docker와 앱 배포용 Docker를 구분하고 관련 문구 검색·diff 검토로 모순이 없는지 확인한다.
- [x] 4.4 #9가 사용할 workspace 위치, health 경로·응답, `/api` 프록시 경로 보존 계약을 실행 가이드에 기록하고 명세·테스트와 대조한다.

## 5. 완료 검증

- [ ] 5.1 문서 작성 이후 새 체크아웃에서 문서만으로 로컬 설치·개발·소스 변경 반영·배포 빌드 실행과 Docker 빌드·기동·API 확인·정리를 재현한다. macOS arm64 및 CI linux/amd64의 실제 검증 결과와 Docker 이미지 아키텍처, 미검증 환경을 기록한다.
- [ ] 5.2 GitHub Actions 실행 결과와 #8 완료 조건을 대조하고 `openspec validate bootstrap-nestjs-server --strict`를 실행한다. 통과·실패·미실행 항목을 구분해 기록하며 미검증 Docker 실행이나 실패한 CI를 완료로 처리하지 않는다.
