## 1. 플러그인 메뉴 계약과 검증

- [x] 1.1 `plugin-config` 타입과 JSON Schema에 필수 단일 메뉴 선언 및 고정 아이콘 목록을 추가하고 유효·누락·지원하지 않는 아이콘 테스트를 통과시킨다.
- [x] 1.2 메뉴 `dataType` 참조와 registry 전체의 정규화 경로 중복 검증을 추가하고 오류 파일·JSON 경로를 확인하는 회귀 테스트를 통과시킨다.
- [x] 1.3 성공한 설정에서 비밀정보 없는 `ClientMenuItem[]`을 source 식별 규칙과 결정적 정렬 규칙으로 생성하고 registry 배열 순서가 다른 테스트를 통과시킨다.
- [x] 1.4 등록된 sample1·sample2·CSV manifest에 서로 다른 메뉴를 선언하고 기존 전체 플러그인 설정 검증을 통과시킨다.

## 2. 웹 빌드 manifest 경계

- [x] 2.1 검증된 설정에서 웹 내부 메뉴 manifest를 생성하는 workspace 스크립트를 추가하고 생성 결과가 예상 route context만 포함하는 테스트를 통과시킨다.
- [x] 2.2 웹 개발·빌드 및 CI가 manifest 생성/최신성 검사를 수행하도록 스크립트를 연결하고 깨끗한 checkout에서 설치와 웹 빌드를 통과시킨다.

## 3. 메뉴와 URL 라우팅

- [x] 3.1 React Router 의존성을 추가하고 생성 manifest를 그룹·순서·제목·경로로 표시하는 공통 레이아웃을 구현해 메뉴 렌더링 테스트를 통과시킨다.
- [x] 3.2 등록 경로에서 동일한 `pluginId`, `sourceId`, `dataType` placeholder context와 선택 상태를 생성하고 알 수 없는 경로에는 context 없는 not-found를 표시하는 라우팅 테스트를 통과시킨다.
- [x] 3.3 Nginx SPA fallback을 `/api` 프록시와 분리해 설정하고 등록 경로 직접 접근·새로고침 및 알 수 없는 경로 브라우저 테스트를 통과시킨다.

## 4. 문서와 통합 검증

- [x] 4.1 플러그인 개발 문서에 메뉴 필드·정렬·아이콘·검증 규칙과 Git/build 산출물 원본 경계를 기록하고 문서 예제가 실제 schema 검증을 통과하게 한다.
- [x] 4.2 변경 패키지의 단위 테스트·타입 검사·lint·웹 빌드와 브라우저/Docker 직접 접근 검증을 실행하고 전체 workspace 회귀 검사를 통과시킨다.
