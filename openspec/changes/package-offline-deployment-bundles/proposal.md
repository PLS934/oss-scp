## Why

#71은 검증된 API·웹 이미지와 배포 파일을 개별 GitHub Release 자산으로 제공하지만, Registry에 접근할 수 없는 단일 서버에서는 필요한 이미지와 설치·업데이트·복구 절차를 한 번에 반입할 수 없다. 0.1.0 기술 프리뷰의 폐쇄망 사용자 여정을 검증하려면 기존 DB용 기본 번들과 PostgreSQL까지 포함한 선택 번들을 불변 자산으로 제공해야 한다.

## What Changes

- API·웹 이미지를 하나의 `images.tar`로 묶은 `oss-scp-bundle-<version>.tar.gz` 기본 자산을 생성하고 기존 PostgreSQL 17.6 또는 MySQL 8.4.6에 연결한다.
- API·웹과 고정된 PostgreSQL 17.6 이미지를 함께 담은 `oss-scp-bundle-<version>-postgresql.tar.gz` 자산을 생성한다.
- 각 번들에 버전 고정 Compose, manifest, 내부 `SHA256SUMS`, 비밀값 없는 환경 예시, 설치·업데이트·롤백·검증 스크립트와 운영 문서를 포함한다.
- DB 서버·database·계정 생성과 백업·복원은 운영자 책임으로 유지하고, 스크립트는 명시적 migration과 안전한 컨테이너 전환·실패 중단만 조율한다.
- 운영자 플러그인·Connection과 사용자 정의 `.tsx` 화면을 번들에서 제외하고, 별도 사전 빌드 설정 revision을 읽기 전용으로 주입한다.
- 최초 설치, 두 테스트 버전 간 업데이트, migration 전 실패 복귀, migration 이후 PostgreSQL·MySQL 백업 복원과 대표 수집·조회 흐름을 오프라인 조건에서 검증한다.
- 전체 CI 이후 두 번들을 기존 개별 자산과 같은 draft GitHub Release에 업로드하고, 실제 RC 게시 기록으로 최종 경로를 확인한다.

## Capabilities

### New Capabilities

- `offline-deployment-bundle`: 기존 DB용 기본 번들과 PostgreSQL 포함 번들의 구조, manifest, 설치·업데이트·복구 동작과 폐쇄망 검증 계약을 정의한다.

### Modified Capabilities

- `github-release-artifacts`: 검증된 개별 이미지 자산을 입력으로 두 오프라인 번들을 만들고 같은 불변 GitHub Release에 게시하도록 자산 계약을 확장한다.

## Impact

- 릴리스 workflow와 자산 생성 스크립트가 두 오프라인 번들의 생성·검증·업로드를 추가로 수행한다.
- 새 bundle template, manifest schema, Compose 변형, 셸 스크립트와 설치·백업·복구 문서가 추가된다.
- Docker CI 시간과 GitHub Release 저장 용량이 증가하며 PostgreSQL 17.6 이미지 digest를 릴리스 입력으로 관리한다.
- 애플리케이션 API, 플랫폼 DB schema, 플러그인 런타임 계약과 공통 React 화면 동작은 변경하지 않는다.
