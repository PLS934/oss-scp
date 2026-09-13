## Context

현재 `.github/workflows/integration-ci.yaml`은 PR과 `main`에서 네 가지 검증 job을 실행하지만 다른 workflow에서 호출할 수 없다. API·웹 Dockerfile은 고정 로컬 태그로 빌드되며 OCI version·revision label이나 Release 자산 생성 경로가 없다. 배포 Compose는 소스 build 설정과 개발용 mock 서비스를 포함한다. 승인된 상세 설계는 `docs/superpowers/specs/2026-09-13-release-automation-design.md`에 있다.

## Goals / Non-Goals

**Goals:**

- 태그 commit의 기존 전체 CI와 실제 게시 자산 사이에 단일 검증 경로를 만든다.
- 태그 파싱과 자산 생성을 로컬에서 재현하고 PR에서 검증할 수 있게 한다.
- 최소 쓰기 권한과 공개 전 draft 단계로 불완전하거나 중복된 Release 게시를 막는다.
- 개별 Release 자산을 #88 오프라인 번들의 안정적인 입력 계약으로 제공한다.

**Non-Goals:**

- 컨테이너 레지스트리에 이미지를 push하지 않는다.
- 플러그인 설정을 플랫폼 이미지에 포함하거나 #88 단일 번들을 생성하지 않는다.
- DB schema/API version 체계를 새로 만들거나 down migration을 제공하지 않는다.
- 기존 애플리케이션 API와 runtime 플러그인 로딩 동작을 변경하지 않는다.

## Decisions

### 기존 CI를 재사용 가능한 workflow로 호출한다

`integration-ci.yaml`에 `workflow_call`을 추가하고 기존 trigger와 job 정의를 유지한다. `release.yaml`은 메타데이터 검증 후 이 workflow를 호출하며, 모든 job 성공을 자산 생성 job의 dependency로 둔다. 검증을 복사하는 방식은 빠르게 시작할 수 있지만 시간이 지나며 PR CI와 릴리스 CI가 달라질 수 있어 제외한다. 과거 commit의 성공 run을 API로 조회하는 방식은 race와 권한 처리가 복잡하고 태그 commit 자체를 재검증하지 않으므로 제외한다.

### 릴리스 규칙을 순수 메타데이터 도구로 분리한다

Node.js 스크립트가 태그를 엄격히 파싱해 version과 prerelease 여부를 출력하고 단위 테스트가 경계값을 검사한다. workflow 표현식이나 여러 shell step에 정규식과 분류 규칙을 나누지 않는다. 이 도구의 출력은 GitHub ref와 SHA에서만 파생하고 사용자 입력으로 덮어쓸 수 없게 한다.

### Dockerfile label과 로컬 이미지 태그를 함께 검증한다

두 runtime stage에 `PRODUCT_VERSION`, `GIT_REVISION` build argument와 OCI label을 추가한다. 빌드 스크립트는 `oss-scp-api:<version>`과 `oss-scp-web:<version>`을 만든 뒤 inspect 결과를 확인한다. 별도 manifest 파일만 제공하면 이미지 이름 변경 시 provenance를 잃기 쉬우므로 label을 원본 증거로 사용하고, Release 본문에는 digest를 함께 기록한다.

### 배포 자산은 결정적인 생성 스크립트가 만든다

한 스크립트가 release output 디렉터리에 이미지 archive, build 항목과 mock 서비스가 없는 Compose, 비밀값이 없는 환경 예시와 정렬된 checksum을 생성한다. Compose는 `OSS_SCP_VERSION` 하나를 두 이미지에 적용한다. 기존 Compose를 문자열 치환하는 대신 별도 배포 template 또는 구조 검증 가능한 생성 입력을 사용해 개발 설정 유입을 방지한다.

API·웹 archive를 분리하면 사용자가 변경된 이미지만 다룰 수 있고 GitHub 자산도 개별 검증할 수 있다. 하나의 `images.tar`는 #88에서 두 archive를 입력으로 다시 패키징한다.

### 생성 자산으로 두 버전 전환을 검증한다

PR Docker 검증은 테스트용 두 제품 버전과 revision label로 이미지를 빌드하고 첫 버전의 archive를 load해 설치한다. migration과 데이터 생성을 확인한 뒤 두 번째 버전 archive를 load하고 `OSS_SCP_VERSION`만 변경해 재생성한다. 전후 volume, migration 이력, 저장 데이터, 외부 설정 mount와 image ID를 비교한다. 기존 설정 revision 교체와 preflight 실패 검사는 공통 helper로 재사용하거나 릴리스 smoke test에서 동일한 assertion을 호출한다.

### draft 완료 후에만 Release를 공개한다

게시 job에만 `contents: write`를 선언한다. 시작 전에 같은 태그 Release 존재 여부를 확인해 있으면 실패한다. Release는 draft로 생성하고 자산을 모두 업로드한 뒤 계산된 prerelease 상태로 공개한다. 업로드 실패 시 공개 상태로 전환하지 않으며, 자동으로 기존 Release를 삭제하거나 자산을 교체하지 않는다.

## Risks / Trade-offs

- [태그에서 전체 CI를 다시 실행해 릴리스 시간이 길어진다] → 검증 정의의 단일화와 태그 commit 보증을 우선하고, 이후 측정 결과가 필요할 때만 안전한 cache를 도입한다.
- [두 테스트 버전 이미지 빌드로 PR Docker 시간이 늘어난다] → 공통 build cache를 사용하고 릴리스 계약에 필요한 smoke 범위만 추가한다.
- [draft 업로드 실패가 수동 정리가 필요한 잔여 draft를 남길 수 있다] → 실패 step과 draft URL을 기록하고 자동 삭제로 증거를 잃지 않는다.
- [호스트 gzip 구현 차이로 archive 바이트가 재현되지 않을 수 있다] → 동일 GitHub runner 환경에서 생성하고 checksum은 게시된 실제 파일을 기준으로 한다. bit-for-bit 재현 빌드는 이번 범위가 아니다.
- [외부 설정 revision이 Release 자산에 없으므로 개별 자산만으로 대표 수집까지 할 수 없다] → #71은 별도 설정 checkout 계약을 문서화하고 CI fixture로 검증한다. #88이 검증된 설정 revision을 오프라인 번들에 포함한다.

## Migration Plan

1. 기존 CI에 `workflow_call`을 추가하고 PR·main trigger 회귀를 확인한다.
2. 메타데이터 및 자산 생성 도구와 Docker label을 추가하고 PR에서 단위·smoke test를 실행한다.
3. 릴리스 workflow와 운영 문서를 병합하되 아직 제품 태그를 만들지 않는다.
4. #88과 #89 및 나머지 0.1.0 게이트 완료 후 검증한 commit에 `v0.1.0` 태그를 한 번 push한다.
5. workflow와 공개 자산 검증이 실패하면 새 commit과 새 출시 후보 태그에서 다시 수행하며 공개 태그를 이동하지 않는다.

롤백은 workflow 파일을 이전 commit으로 되돌리는 일반 PR로 수행한다. 이미 공개된 Release와 태그는 자동으로 삭제하거나 덮어쓰지 않는다.
