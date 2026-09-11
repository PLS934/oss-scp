## 1. 외부 설정 루트와 preflight 계약

- [x] 1.1 `plugin-config`에 명시적 외부 설정 루트의 구조·registry를 검증하는 실패 테스트를 추가하고, 현재 저장소 레이아웃과 임시 외부 디렉터리가 같은 결과를 내는지 확인한다.
- [x] 1.2 lexical 경로 이탈과 실제 경로 심볼릭 링크 이탈을 plugin registry·source·transform·로컬 CSV에 공통 적용하고 루트 내부 링크·외부 링크 경계 테스트를 통과시킨다.
- [x] 1.3 등록된 모든 JavaScript transform을 import해 `transform` export와 로딩 가능성을 검사하는 비동기 preflight를 구현하고 누락 export·TypeScript 참조·누락 의존성·top-level 예외가 안정적인 비민감 오류로 변환되는지 테스트한다.
- [x] 1.4 설정 검증 CLI가 `OSS_SCP_CONFIG_ROOT` 또는 명시적 `--root`를 사용하고 배포 모드에서 cwd 탐색으로 대체하지 않는지 프로세스 테스트로 확인한다.

## 2. API와 수동 수집 소비 경계

- [x] 2.1 API 설정에 필수 외부 설정 루트 입력을 추가하고 DB 연결과 listen 전에 preflight를 실행하여 잘못된 registry·모듈일 때 DB 연결 없이 기동 실패하는 서버 테스트를 통과시킨다.
- [x] 2.2 검증된 preflight 메뉴만 반환하는 읽기 전용 API endpoint를 추가하고 base URL·secret·transform 경로가 응답에 포함되지 않으며 오류 시 부분 메뉴를 제공하지 않는지 확인한다.
- [x] 2.3 수동 수집 CLI의 저장소 루트 자동 탐색을 외부 설정 루트 입력으로 교체하고 로컬·배포 실행, 누락 루트, 임의 plugin 경로 우회 거부 및 기존 종료 코드 회귀 테스트를 통과시킨다.
- [x] 2.4 API와 CLI가 같은 외부 설정 fixture에서 동일한 plugin/source/dataType 정의를 선택하는 통합 테스트를 추가하고 원천 접근 전 검증 순서를 확인한다.

## 3. 클라이언트 메뉴 런타임 공급

- [x] 3.1 빌드 생성 `plugin-menu.ts` 의존성을 제거하고 메뉴 API client에 성공·schema 오류·HTTP 실패·취소 테스트를 추가한다.
- [x] 3.2 React 앱이 메뉴 로딩·실패·성공 상태를 구분하고 성공 후 기존 정렬·메뉴 선택·직접 URL·새로고침·not-found route context를 유지하는 컴포넌트 및 브라우저 테스트를 통과시킨다.
- [x] 3.3 외부 registry에서 경로와 이름이 다른 플러그인으로 서버를 재기동했을 때 웹 이미지 재빌드 없이 메뉴가 바뀌는 Docker 통합 테스트를 추가한다.

## 4. 이미지와 Compose 배포 분리

- [x] 4.1 API Dockerfile에서 저장소 플러그인·Connection·fixture 복사와 transform 빌드를 제거하되 설정 schema·preflight·수동 CLI 실행 파일은 남기고 이미지 내부에 운영자 플러그인이 없음을 정적 검사한다.
- [x] 4.2 외부 PostgreSQL Compose에 명시적 host 설정 디렉터리의 `/config:ro` mount와 `OSS_SCP_CONFIG_ROOT=/config`를 추가하고 비어 있거나 예상하지 않은 경로를 허용하지 않는 Compose 검사 테스트를 통과시킨다.
- [x] 4.3 고정 API 이미지로 외부 설정 preflight를 실행한 뒤 같은 mount로 API·수동 수집·메뉴·PostgreSQL 저장·조회가 동작하는 end-to-end Docker 검증을 통과시킨다.
- [x] 4.4 같은 API 이미지에서 플러그인 디렉터리 revision만 교체·재기동해 메뉴와 수집 결과가 바뀌며, 잘못된 revision에서는 서비스가 기동하지 않는 통합 테스트를 통과시킨다.

## 5. 문서와 전체 검증

- [x] 5.1 통합 개발 플랜을 외부 서버 플러그인 배포 원칙과 #52 → #62 → #53·#54 순서로 갱신하고 사용자 정의 React 화면의 플랫폼 빌드 결합을 명시한다.
- [x] 5.2 플러그인·서버·수동 수집·외부 DB 문서에 JavaScript 사전 빌드, 읽기 전용 주입, image digest·plugin Git SHA 고정, 대상 이미지 preflight, 재기동과 DB migration을 분리한 롤백 절차를 작성하고 문서 명령을 검증한다.
- [x] 5.3 영향받는 패키지 test·typecheck·build, lint, 프로세스·브라우저·Docker 외부 PostgreSQL 통합 검증과 `openspec validate separate-server-plugin-deployment --strict`를 실행해 모두 통과시킨다.
