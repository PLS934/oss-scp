## Why

현재 GitHub Release는 최종 사용자가 설치에 사용하는 두 번들과 번들 제작 과정의 개별 API·웹 image archive, Compose, 환경 예시를 함께 게시해 자산 선택이 불필요하게 복잡하다. `v0.1.0-rc.1` 게시 결과를 기준으로 공개 자산을 실제 설치 단위로 정리해, 운영자가 두 번들 중 하나만 선택하고 외부 checksum으로 내려받은 파일을 검증할 수 있게 한다.

## What Changes

- `v0.1.0-rc.2` 이후 GitHub Release 공개 자산을 기존 DB용 번들, PostgreSQL 포함 번들, 두 번들을 검증하는 외부 `SHA256SUMS`의 세 파일로 제한한다.
- API·웹 image archive, Compose, 환경 예시는 번들 생성에 필요한 내부 산출물로 계속 생성하되 GitHub Release에는 직접 게시하지 않는다.
- 외부 `SHA256SUMS`와 각 번들 내부 `SHA256SUMS`의 검증 대상을 문서와 Release 본문에서 구분한다.
- 릴리스 자동화 검증에서 공개 자산의 정확한 목록과 개별 내부 산출물의 비공개를 확인한다.
- 이미 게시된 `v0.1.0-rc.1` Release와 자산은 변경하지 않는다.

범위 제외:

- 번들 내부 구성, 지원 DB 버전, 설치·업데이트·롤백 절차는 변경하지 않는다.
- 컨테이너 Registry 게시 또는 별도 설치 채널은 추가하지 않는다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `github-release-artifacts`: GitHub Release의 공개 자산 계약을 개별 산출물 포함 7개에서 설치용 번들 2개와 외부 checksum 1개로 변경한다.

## Impact

- 릴리스 워크플로의 업로드 목록과 checksum 생성 순서가 변경된다.
- 릴리스 자동화 테스트, Release 본문, 설치 문서와 자산 사용 안내가 새 공개 자산 계약에 맞게 변경된다.
- 번들 생성기의 입력 형식과 번들 내부 무결성 계약은 유지된다.
- 사용자는 기존 DB용 또는 PostgreSQL 포함 번들 중 하나를 선택해 내려받으며, API·웹 archive를 별도로 선택할 필요가 없어진다.
