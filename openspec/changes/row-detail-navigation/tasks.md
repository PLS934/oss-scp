## 1. 행 상세 이동 구현

- [x] 1.1 `RecordListView`의 상세 액션 열을 제거하고 첫 셀 Link와 행 클릭 연결을 구현한다. 정적 렌더링 검사에서 선언된 컬럼만 남고 href가 현재 메뉴와 내부 UUID를 사용하는지 확인한다.
- [x] 1.2 메뉴명·표시값·UUID 기반 접근 가능한 링크 이름과 행마다 한 번의 Tab 정지점을 제공한다. 누락·중복 표시값, 외부 키와 비공개 필드 제외를 웹 테스트에서 검증한다.
- [x] 1.3 전용 클래스의 행 hover/focus 스타일과 pointer cursor를 적용한다. 브라우저에서 셀 여백 클릭과 전체 행 focus 표시를 확인한다.

## 2. 자동화 회귀 검증

- [x] 2.1 `apps/web/test/record-list.test.tsx`를 갱신해 상세 열 제거, href, 접근 가능한 이름, 로딩·빈 결과·실패 상태의 가상 링크 부재를 검증하고 웹 테스트를 통과시킨다.
- [x] 2.2 `scripts/test-browser.mjs`의 `보기` 선택을 바꾸고 첫 셀·다른 셀·셀 여백 클릭, Tab·Enter 이동, 링크 의미와 UUID 경로, 텍스트 선택 시 이동 억제, 상세에서 목록 복귀를 검증한다. 표의 header/cell 접근성과 기존 페이징 검사를 유지한다.
- [x] 2.3 1번과 2.1~2.2 이후 기존 GitHub Actions 검사 경로에서 웹 테스트·typecheck·lint·build 및 `pnpm test:browser` 실행 결과를 확인한다. 미실행 검증은 이유를 기록한다.

## 3. 명세 및 PR 정리

- [x] 3.1 변경 명세와 최종 구현을 대조하고 `openspec validate row-detail-navigation --strict` 및 `git diff --check`를 통과시킨다.
- [x] 3.2 main 기준 독립 diff와 프로젝트 PR 템플릿을 확인하고 #87 전체 완료 시 `Closes #87`을 연결한 PR을 생성한다. #86·#74 코드가 포함되지 않았는지 확인하고 겹치는 파일의 통합 검증 결과 또는 남은 검증을 본문에 명시한다.


검증 기록: 웹 Vitest 61개, 전체 `pnpm build`·`pnpm typecheck`·`pnpm lint`, Docker PostgreSQL 기반 `pnpm test:browser`, OpenSpec strict validation을 통과했다. GitHub Actions 결과는 PR에서 확인한다. #86·#74와 조합한 검증은 독립 PR의 코드를 유지한 채 통합 검증 작업에서 수행한다.
