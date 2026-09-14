## 1. 공개 자산 계약 테스트

- [x] 1.1 릴리스 workflow 정적 테스트에 두 번들과 외부 `SHA256SUMS`만 업로드된다는 허용 목록 및 개별 API·웹 archive, Compose, 환경 예시의 금지 목록 검증을 추가하고 해당 Node 테스트의 실패·통과를 확인한다
- [x] 1.2 외부 checksum 생성 테스트를 추가해 두 번들만 파일명 순서로 기록하고 자신과 내부 산출물을 제외하는지 확인한다

## 2. 릴리스 산출물과 게시 자동화

- [x] 2.1 번들 생성 후 `bundle-output/SHA256SUMS`를 생성·검증하도록 릴리스 스크립트를 변경하고 checksum 관련 자동화 테스트를 통과시킨다
- [x] 2.2 GitHub Release 생성 명령의 업로드 목록을 두 번들과 `bundle-output/SHA256SUMS`로 제한하고 릴리스 workflow 정적 테스트를 통과시킨다
- [x] 2.3 기존 release-output 기반 번들 생성·검증을 유지하고 릴리스 및 오프라인 번들 관련 전체 테스트를 실행해 내부 산출물이 계속 정상 동작하는지 확인한다

## 3. 사용자 안내 정리

- [x] 3.1 Release 본문에 기존 DB용/ PostgreSQL 포함 번들의 선택 기준과 외부·내부 checksum 검증 순서를 추가하고 본문 생성 테스트로 확인한다
- [x] 3.2 개별 자산 설치 문서를 번들 중심 안내로 정리하고 README 및 개발 계획의 공개 자산 설명이 세 파일 계약과 일치하는지 문서 검색으로 확인한다

## 4. 통합 검증과 릴리스 준비

- [x] 4.1 `openspec validate publish-bundle-only-release-assets --strict`와 저장소의 릴리스·번들 검증 명령을 실행해 변경 계약과 구현이 모두 통과하는지 확인한다

## 후속 릴리스 검증

PR 병합 후 다음 RC의 draft Release에서 공개 자산이 두 번들과 외부 `SHA256SUMS`만 포함하고 외부·내부 checksum 검증이 모두 성공하는지 확인한다. 이 실행 기록은 병합 전 구현 완료 조건이 아니며, 해당 RC의 후속 배포 검증 기록으로 남긴다.

실행 기록(2026-09-14):

- `v0.1.0-rc.2` 태그는 PR #98 병합 commit `e7b172dd8b59a30458386445233e707d30994eae`에 생성했다.
- GitHub Actions run `34807921215`에서 태그 검증, PostgreSQL·MySQL, 로컬 개발·배포 빌드, Docker 전체 검증과 자산 게시가 모두 성공했다.
- GitHub prerelease에는 `oss-scp-bundle-0.1.0-rc.2.tar.gz`, `oss-scp-bundle-0.1.0-rc.2-postgresql.tar.gz`, `SHA256SUMS`만 게시됐다.
- 세 자산의 로컬 SHA-256은 GitHub asset digest와 일치했고, 외부 `SHA256SUMS`는 두 번들 archive를 모두 검증했다.
- 다운로드한 두 번들의 내부 checksum, manifest, 제품 버전·Git revision 및 이미지 목록 검증이 성공했다.
