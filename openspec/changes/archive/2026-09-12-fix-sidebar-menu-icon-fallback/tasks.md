## 1. 사이드바 회귀 수정

- [x] 1.1 아이콘 렌더러가 없는 서버 자산·저장소 메뉴가 아이콘 텍스트나 빈 영역 없이 선언된 제목만 한 번 렌더링되는 회귀 테스트를 추가하고 변경 전 실패를 확인한다.
- [x] 1.2 실제 아이콘 컴포넌트가 없는 현재 메뉴에서 텍스트 기반 아이콘 대체 출력을 제거하고 웹 패키지 테스트로 회귀 테스트 통과를 확인한다.

## 2. 통합 검증

- [x] 2.1 웹 패키지의 typecheck·test·build와 전체 workspace의 typecheck·lint·test·build를 실행해 기존 동작에 회귀가 없는지 확인한다.
- [x] 2.2 CI의 Docker 빌드 및 실행 job 명령과 `openspec validate fix-sidebar-menu-icon-fallback --strict`를 실행해 배포 화면과 명세 일관성을 확인한다.
