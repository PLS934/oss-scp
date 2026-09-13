# GitHub Release Docker 설치·업데이트 자동화 설계

## 목적

Git 태그가 가리키는 정확한 commit을 다시 검증하고, 사용자가 소스를 빌드하지 않아도 설치·업데이트할 수 있는 API·웹 Docker 이미지와 배포 파일을 GitHub Release에 게시한다. 플랫폼 이미지와 외부 플러그인 설정 revision은 독립적으로 교체할 수 있어야 하며, 릴리스 과정은 기존 자산을 덮어쓰지 않는다.

이 설계는 이슈 #71의 개별 GitHub Release 자산까지만 다룬다. 이슈 #88은 여기서 생성한 자산과 검증된 플러그인 설정 revision을 입력으로 받아 단일 폐쇄망 번들, 설치·업데이트·복구 스크립트를 제공한다. 컨테이너 레지스트리, Kubernetes·Helm, 자동 DB down migration과 무중단 배포는 범위 밖이다.

## 태그와 릴리스 분류

릴리스 workflow는 `v*` 태그 push로 시작하지만, 산출물을 만들기 전에 다음 형식만 허용한다.

- 안정 버전: `v<MAJOR>.<MINOR>.<PATCH>`
- 출시 후보: `v<MAJOR>.<MINOR>.<PATCH>-rc.<NUMBER>`

각 숫자는 `0` 또는 0으로 시작하지 않는 양의 정수만 허용한다. 태그의 선행 `v`를 제거한 값을 제품 버전으로 사용한다. `v0.x.y`와 모든 RC는 GitHub prerelease로, `v1.0.0` 이후 안정 버전은 정식 Release로 게시한다. 다른 접미사, build metadata, 빈 RC 번호와 잘못된 숫자 형식은 이미지 빌드나 Release 생성 전에 실패한다.

메타데이터 단계는 제품 버전, 태그, Git commit SHA, prerelease 여부를 후속 job output으로 제공한다. 제품 버전과 revision은 사용자가 별도로 입력할 수 없고 GitHub ref와 `github.sha`에서만 계산한다.

## Workflow 구조와 권한

기존 `.github/workflows/integration-ci.yaml`에 `workflow_call`을 추가한다. 현재의 PR, `main` push와 수동 실행 진입점은 유지한다. 검증 job의 내용은 한 곳에만 두며 호출 방식에 따라 달라지지 않는다.

새 `.github/workflows/release.yaml`의 흐름은 다음과 같다.

1. 태그 메타데이터를 파싱하고 형식을 검증한다.
2. 재사용 가능한 통합 CI를 호출해 태그 commit에서 PostgreSQL, MySQL, 로컬 빌드·테스트, Docker·브라우저 검증을 모두 다시 실행한다.
3. 검증이 모두 성공한 경우에만 릴리스 이미지를 빌드하고 자산을 생성한다.
4. 동일 태그의 Release가 없는지 확인한다.
5. draft Release를 만들고 모든 자산을 업로드한 후 prerelease 또는 정식 상태로 공개한다.

기본 및 통합 CI 권한은 `contents: read`다. Release를 생성하고 자산을 업로드하는 게시 job에만 `contents: write`를 부여한다. `packages: write`, `pull-requests: write` 등 불필요한 권한은 부여하지 않는다. 동일 태그 Release가 이미 있으면 기존 Release나 자산을 변경하지 않고 실패한다. 자산 업로드 중 실패한 draft는 공개 릴리스로 전환하지 않는다.

## 이미지 버전과 OCI 메타데이터

API와 웹 Dockerfile은 `PRODUCT_VERSION`과 `GIT_REVISION` build argument를 받고 최종 runtime image에 다음 OCI label을 기록한다.

- `org.opencontainers.image.version=<제품 버전>`
- `org.opencontainers.image.revision=<전체 Git commit SHA>`
- `org.opencontainers.image.source=https://github.com/PLS934/oss-scp`

릴리스 빌드는 API와 웹을 각각 `oss-scp-api:<제품 버전>`, `oss-scp-web:<제품 버전>`으로 만든다. 빌드 직후 `docker image inspect`로 두 이미지의 version과 revision label 및 태그를 기대값과 비교한다. 이미지 이름을 바꾸더라도 label은 유지된다.

## Release 자산 계약

버전 `0.1.0`의 자산 이름은 다음과 같다.

```text
oss-scp-api-0.1.0.tar.gz
oss-scp-web-0.1.0.tar.gz
oss-scp-0.1.0-compose.yaml
oss-scp-0.1.0.env.example
SHA256SUMS
```

각 이미지 archive는 버전 태그가 붙은 단일 Docker image를 `docker save`한 뒤 gzip으로 압축한다. 배포용 Compose는 개발용 `build`와 `mock-api`를 포함하지 않는다. `OSS_SCP_VERSION` 하나로 API·웹의 같은 제품 버전을 선택하며, PostgreSQL 영속 volume과 외부 `OSS_SCP_CONFIG_PATH:/config:ro` 계약을 유지한다.

환경변수 예시는 `OSS_SCP_VERSION`, 외부 설정 절대 경로, 공개 포트와 DB 연결에 필요한 키를 설명하되 비밀번호나 토큰 값을 포함하지 않는다. 비밀번호는 사용자가 별도 환경 또는 Compose secret override로 제공한다. `SHA256SUMS`는 자신을 제외한 네 자산의 SHA-256을 결정적인 파일명 순서로 기록한다.

산출물 생성은 로컬에서도 실행 가능한 스크립트로 구현한다. 태그 해석, Compose·환경 예시 생성, 이미지 label 검사, archive와 checksum 생성 규칙을 Actions YAML에 중복하지 않는다. workflow는 이 스크립트에 GitHub에서 계산한 태그와 commit만 전달한다.

## 설치와 업데이트 흐름

최초 설치 사용자는 모든 자산을 같은 디렉터리에 받은 뒤 `SHA256SUMS`를 검증하고 API·웹 archive를 `docker load`한다. 별도로 준비한 운영 플러그인 설정 checkout의 절대 경로와 DB 비밀번호를 환경에 제공한다. Compose 설정을 검사한 후 DB를 먼저 기동하고 다음과 같이 API 이미지 안의 migration CLI를 명시적으로 실행한다.

```bash
docker compose -f oss-scp-0.1.0-compose.yaml run --rm api \
  node node_modules/@oss-scp/platform-db/dist/migrate-cli.js
```

migration 성공 후 API와 웹을 기동하고 health·ready를 확인한다. 애플리케이션 시작 시 migration을 자동 실행하지 않는다.

업데이트는 새 자산의 checksum을 확인하고 새 이미지를 로드한 뒤 `OSS_SCP_VERSION`만 새 버전으로 변경한다. 해당 버전의 migration을 먼저 성공시킨 후 컨테이너를 재생성한다. 외부 플러그인·Connection 설정 경로와 플랫폼 DB volume은 교체하지 않는다.

플랫폼 롤백은 이전에 검증한 이미지 버전으로 `OSS_SCP_VERSION`을 되돌리고 컨테이너를 재생성한다. DB down migration은 제공하지 않으므로, 새 migration이 이전 이미지와 호환되지 않으면 업데이트 전 백업을 복원해야 한다. 플러그인만 교체할 때는 이미지 버전을 유지한 채 검증된 설정 revision으로 경로를 바꾸고 API만 재시작한다. 호환되지 않는 revision은 DB 접속과 listen 전에 거부하며 이전 설정 revision으로 되돌린다.

## 자동 검증

태그 파서 단위 테스트는 안정 버전, RC, `0.x` prerelease 판정과 잘못된 태그를 다룬다. 산출물 계약 테스트는 버전이 고정된 파일명, Compose의 이미지 조합, 개발용 build·mock 제외, 비밀정보 없는 환경 예시와 checksum 목록을 검사한다.

릴리스 smoke test는 임시 디렉터리에서 다음을 검증한다.

1. 생성된 checksum을 검증하고 archive를 `docker load`한다.
2. 저장소의 테스트용 외부 설정 revision을 읽기 전용으로 마운트한다.
3. 배포용 Compose로 PostgreSQL을 기동하고 API 이미지의 migration CLI를 실행한다.
4. API·웹을 기동해 health·ready와 기본 요청을 확인한다.
5. 서로 다른 두 테스트 제품 버전 label로 만든 이미지 조합 사이에서 `OSS_SCP_VERSION`만 변경해 업데이트한다.
6. 업데이트 후 migration 이력·테스트 데이터, DB volume과 외부 설정 경로가 유지되는지 확인한다.
7. 이미지 ID를 기록해 플러그인 revision 교체 전후 API·웹 이미지가 다시 빌드되지 않았음을 확인한다.
8. 호환되지 않는 설정 revision이 기동 전에 거부되는지 확인한 뒤 이전 이미지·설정 조합으로 복구한다.

기존 Docker 검증의 설정 revision 교체, preflight 실패, DB 영속성 검사는 재사용하거나 공통 스크립트로 추출해 같은 계약을 중복 구현하지 않는다. 실제 GitHub Release 게시 자체는 태그 workflow에서만 수행하며 PR에서는 게시를 제외한 메타데이터·산출물·설치 검증을 실행한다.

## 오류 처리와 관측 가능성

각 실패는 태그 검증, 통합 CI, 이미지 빌드, label 검사, archive 생성, checksum, 설치 smoke test, Release 존재 확인, 업로드 또는 공개 단계 중 어디에서 발생했는지 job과 step 이름으로 구분한다. 비밀번호와 토큰은 로그에 출력하지 않는다.

Release 본문에는 제품 버전, 전체 Git revision, API·웹 image digest, 지원 환경, migration 주의사항과 알려진 제한을 기록한다. 플러그인 Git SHA는 제품 자산에 내장하지 않으며 실제 배포 기록에서 이미지 digest와 함께 관리한다. schema/API 버전이 별도로 도입되면 같은 배포 기록에 추가하되, 현재 존재하지 않는 버전을 임의로 만들지 않는다.

## 완료 판단

PR에서는 태그 파서와 생성 스크립트 테스트, 두 테스트 버전 간 설치·업데이트 smoke test, 기존 전체 CI가 성공해야 한다. 병합 후에는 실제 출시 후보 태그에서 workflow가 prerelease를 게시하고, 게시 자산을 새 Docker 환경에서 다시 검증한다. `v0.1.0` 공개는 #88과 #89를 포함한 기술 프리뷰 게이트가 모두 완료된 뒤에만 수행한다.
