## 1. 실행 기반

- [x] 1.1 apps/mock-api 패키지와 기존 버전의 NestJS·TypeScript·Vitest 구성을 추가하고 잠금 파일 설치·타입 검사·빌드 성공을 확인한다.
- [x] 1.2 dev:mock·start:mock 및 MOCK_HOST·MOCK_PORT 설정을 추가하고 기본 주소·사용자 포트 실행, 잘못된 포트와 점유 포트의 비정상 종료를 프로세스 테스트로 확인한다.
- [x] 1.3 fixture 로딩과 최소 구조 검증을 추가하고 실행 cwd 독립성, 누락·잘못된 JSON·total 불일치의 시작 실패를 테스트한다.
- [x] 1.4 빌드 산출물에 세 fixture를 복사하고 원본 바이트 일치와 개발 시 fixture 변경 후 자동 복사·재시작을 검증한다.

## 2. HTTP 응답

- [x] 2.1 /sample1 분할 응답과 쿼리 검증을 구현하고 20·20·20·12건 병합 원본 일치, 개별 기본값, 경계값, 범위 초과 offset을 HTTP 테스트로 확인한다.
- [x] 2.2 음수·소수·문자·빈 값·공백·지수·반복 키·배열·안전 정수 초과와 limit 범위 위반을 HTTP 400으로 처리하고 오류 후 정상 응답을 테스트한다.
- [x] 2.3 /sample2 전체 응답을 구현하고 153건과 최상위 필드·중첩 값·타입을 원본 전체 비교로 검증한다.
- [x] 2.4 /vulnerabilities.csv 다운로드를 구현하고 원본 바이트·53행·콘텐츠 유형·파일명 헤더를 HTTP 테스트로 검증한다.
- [x] 2.5 없는 경로의 JSON 404와 이후 세 정상 경로 응답을 테스트한다.

## 3. Docker 실행

- [x] 3.1 mock Dockerfile과 .dockerignore 입력을 추가하고 소스 마운트 없는 이미지의 비루트 실행·health·세 경로 원본 일치·HTTP 400을 검증한다.
- [x] 3.2 compose.yaml에 mock 프로필·서비스·loopback 공개 포트를 추가하고 mock 단독 및 세 서비스 실행, 호스트 포트 변경, api에서 mock-api:3001 접근을 검증한다.
- [x] 3.3 compose.dev.yaml에 mock 개발 실행과 서비스별 의존성 볼륨을 추가하고 소스·fixture 변경 자동 반영과 기존 api·web 개발 실행을 검증한다.
- [x] 3.4 mock 비활성·중단 시 기존 web·api health 동작을 확인하고 Docker 테스트 종료 시 생성 컨테이너·볼륨 정리를 검증한다.

## 4. 통합 및 안내

- [x] 4.1 CI의 workspace 검사와 Docker job에 mock 검증을 연결하고 Docker 전용 검사 명령의 실패가 CI 실패로 반영되는지 확인한다.
- [x] 4.2 fixtures/README.md와 실행 문서에 로컬·Docker 단독·세 서비스·Docker 개발 명령, 종료·정리, 호스트·컨테이너 주소, 설정, 요청·응답 예시를 작성하고 깨끗한 checkout에서 재현한다.
- [x] 4.3 루트 pnpm typecheck·lint·test·build와 Docker 검사를 실행해 기존 API·웹 회귀를 확인하고 실제 검증 OS·CPU와 미검증 항목을 기록한다.

## 검증 결과

2026-09-09, macOS arm64, Node.js 24.19.0, pnpm 10.34.5, Docker linux/aarch64, Compose v5.3.1에서 검증했다.

- frozen-lockfile 설치, 전체 타입 검사·린트·빌드 통과.
- Vitest 총 66개 통과: mock 43개, API 12개, 웹 11개.
- 기존 API 및 mock 프로세스 테스트 통과: 시작 오류, 포트 점유, 다른 cwd, 변경 반영, 종료.
- mock Docker 검사 통과: 단독 Compose·이미지, 세 서비스, 내부 통신, mock 중단·기본 제외, 개발 소스·fixture 변경, 컨테이너·볼륨 정리.
- 기존 API Docker 검사와 웹 Docker 브라우저·HMR·watch·의존성 재설치 검사 통과.
- 로컬 브라우저 검사는 첫 실행의 5초 실패 표시 대기에서 타임아웃이 있었고 최종 재실행은 통과했다. 해당 웹 코드·기대값은 수정하지 않았다.
- OpenSpec strict 검증 통과. GitHub Actions 실행 결과와 linux/amd64·Windows 로컬 실행은 아직 확인하지 않았다.

## 리뷰 후 회귀 수정

- [x] 5.1 최초 개발 빌드 실패 코드를 상위 프로세스에 전달하고 JSON 두 파일·CSV 각각 누락 시 비정상 종료, 서버 미기동을 프로세스 테스트로 확인한다. 수정 전 종료 대기 타임아웃, 수정 후 통과를 확인했다.
- [x] 5.2 Docker 개발 실행에서 필수 CSV 누락 시 컨테이너가 오류 종료하고 기존 web·api는 유지되는지 회귀 검사한다.

리뷰 수정 후 mock HTTP 테스트 43개와 로컬 프로세스 회귀 테스트, 린트를 통과했다.

Docker 회귀 검사도 통과했다. 필수 CSV 누락 시 개발 컨테이너의 비정상 종료와 기존 web·api 유지, 테스트 자원 정리를 확인했다.

## 코드 품질 개선

- [x] 6.1 JSON 파싱 결과를 unknown으로 받고 구조 검증 후 명시적인 fixture·응답 타입을 사용한다. mock 타입 검사와 HTTP 테스트 43개 통과.
- [x] 6.2 빌드·서버 프로세스 참조를 분리하고 runBuild·startServer·stopServer로 수명 관리를 나눈다. 시작 실패·변경 반영·종료 프로세스 테스트 통과.
- [x] 6.3 테스트 코드를 정리하고 Docker 시나리오를 함수로 분리하며 HTTP 요청 제한 시간을 적용한다. 로컬·Docker 회귀 검증으로 기존 계약을 확인한다.

품질 개선 후 Docker 단독·통합·개발 변경 반영·시작 실패 회귀 검사 통과. 포맷 정리 중 생성된 임시 테스트 복사본에서는 소스 문자열 치환이 일치하지 않아 실패했으며, 작은따옴표 형식을 일치시킨 최종 코드로 로컬 프로세스와 Docker 검사를 다시 실행해 통과했다.

## CI 후속 수정

- [x] 7.1 GitHub Actions linux/amd64에서 임시 복사본의 root 소유 dist 삭제가 EACCES로 실패한 문제를 해결하기 위해 Docker 개발 dist를 전용 볼륨으로 분리한다. 로컬 Docker 전체 검사와 lint를 통과했고 호스트 dist 미생성 회귀 assertion을 추가했다. 원격 CI는 후속 커밋에서 다시 확인한다.

## 아카이브

2026-09-09에 source-mock-api 본 명세로 요구사항·시나리오를 동기화하고 일치를 확인했다. 원격 PR 병합은 별도이며, 아카이브 후 CI 결과는 PR #16에서 확인한다.
