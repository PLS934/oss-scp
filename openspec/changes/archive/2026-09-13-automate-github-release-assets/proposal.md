## Why

현재 CI는 소스와 Docker 실행을 검증하지만 태그의 제품 버전·commit을 이미지에 기록하거나, 소스 빌드 없이 설치할 수 있는 GitHub Release 자산을 생성하지 않는다. 0.1.0 기술 프리뷰와 이후 릴리스에서 검증한 commit과 실제 배포 산출물을 일치시키고 반복 가능한 설치·업데이트 경로를 제공해야 한다.

## What Changes

- 기존 통합 CI를 태그 릴리스 workflow에서도 재사용할 수 있게 하고, 태그 commit의 전체 검증 성공을 게시 조건으로 사용한다.
- 안정 버전과 RC 태그를 검증하고 `0.x` 및 RC를 prerelease로 분류한다.
- 제품 버전과 Git revision을 API·웹 이미지 태그와 OCI label에 자동 주입하고 검사한다.
- API·웹 image archive, 버전 고정 Compose, 비밀정보 없는 환경변수 예시와 SHA-256 checksum을 결정적인 이름으로 생성한다.
- 생성된 자산으로 소스 빌드 없는 최초 설치, 명시적 migration, 두 테스트 버전 간 업데이트, 설정·DB 보존과 롤백을 검증한다.
- 최소 GitHub 권한으로 draft Release에 자산을 올린 뒤 공개하며 기존 태그 Release를 덮어쓰지 않는다.
- 설치·업데이트·플러그인 교체·실패 복구 절차와 릴리스 기록 항목을 문서화한다.
- 단일 폐쇄망 번들과 설치·복구 스크립트는 #88에 남기고 컨테이너 레지스트리 게시는 포함하지 않는다.

## Capabilities

### New Capabilities

- `github-release-artifacts`: 태그 검증, 이미지 provenance, 배포 자산 계약, 게시 안전성과 설치·업데이트 검증을 정의한다.

### Modified Capabilities

- `technical-preview-release`: 0.1.0을 prerelease로 분류하고, 태그 commit에서 검증한 개별 Release 자산을 후속 오프라인 번들의 입력으로 사용하는 출시 조건을 구체화한다.

## Impact

- `.github/workflows/integration-ci.yaml`과 새 릴리스 workflow의 호출 구조 및 권한이 변경된다.
- API·웹 Dockerfile에 build argument와 OCI label이 추가된다.
- 릴리스 메타데이터·자산 생성과 smoke test를 위한 스크립트 및 테스트가 추가된다.
- 배포용 Compose·환경변수 예시가 생성되며 설치·업데이트 문서가 확장된다.
- 애플리케이션 API, DB schema와 플러그인 runtime 계약은 변경하지 않는다.
