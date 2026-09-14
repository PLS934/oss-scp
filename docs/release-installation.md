# GitHub Release 개별 자산 설치·업데이트

이 문서는 GitHub Release의 개별 Docker 자산으로 oss-scp를 설치·업데이트하는 절차를 설명한다. 0.x는 기술 프리뷰이며 검증 대상은 Ubuntu 24.04 linux/amd64와 Docker Compose다. Registry 연결 없이 단일 압축 파일로 반입하고 설치·복구 스크립트를 사용하려면 [폐쇄망 번들 가이드](offline-bundle.md)를 따른다.

## 준비

같은 GitHub Release에서 다음 파일을 한 디렉터리에 받는다. 아래 명령은 0.1.0을 예로 든다.

```text
oss-scp-api-0.1.0.tar.gz
oss-scp-web-0.1.0.tar.gz
oss-scp-0.1.0-compose.yaml
oss-scp-0.1.0.env.example
SHA256SUMS
```

운영 플러그인 Git checkout을 별도 디렉터리에 준비하고 정확한 commit SHA를 기록한다. 이 checkout에는 `plugins/`, `connections/`와 필요한 fixture가 있어야 하며 비밀번호나 토큰을 저장하지 않는다. API 컨테이너 UID 1000이 모든 상위 디렉터리를 탐색하고 설정 파일을 읽을 수 있어야 한다. 자세한 권한 계약은 [플랫폼 DB 가이드](platform-db.md#외부-플러그인과-이미지-배포)를 따른다.

## 최초 설치

다운로드 디렉터리에서 checksum과 이미지 provenance를 먼저 확인한다.

```bash
sha256sum --check SHA256SUMS
gzip -dc oss-scp-api-0.1.0.tar.gz | docker load
gzip -dc oss-scp-web-0.1.0.tar.gz | docker load
docker image inspect oss-scp-api:0.1.0 \
  --format '{{ index .Config.Labels "org.opencontainers.image.version" }} {{ index .Config.Labels "org.opencontainers.image.revision" }}'
docker image inspect oss-scp-web:0.1.0 \
  --format '{{ index .Config.Labels "org.opencontainers.image.version" }} {{ index .Config.Labels "org.opencontainers.image.revision" }}'
```

환경변수 예시를 복사하고 실제 설정 경로를 수정한다. DB 비밀번호는 파일에 저장하지 않고 셸 또는 별도 Compose secret override로 제공한다.

```bash
cp oss-scp-0.1.0.env.example .env
export PLATFORM_DB_PASSWORD='충분히-긴-무작위-비밀번호'
export OSS_SCP_CONFIG_PATH=/absolute/path/to/operator-plugin-config
export OSS_SCP_VERSION=0.1.0
```

Compose 구성을 검사하고 DB migration을 명시적으로 적용한 다음 서비스를 기동한다. migration이 실패하면 API·웹 기동을 진행하지 않는다.

```bash
compose_file=oss-scp-0.1.0-compose.yaml
docker compose -f "$compose_file" config --quiet
docker compose -f "$compose_file" up -d --wait postgres
docker compose -f "$compose_file" run --rm api \
  node node_modules/@oss-scp/platform-db/dist/migrate-cli.js
docker compose -f "$compose_file" up -d --wait api web
curl --fail http://127.0.0.1:3000/api/v1/health
curl --fail http://127.0.0.1:3000/api/v1/ready
```

health는 `{"status":"ok"}`, ready는 `{"status":"ready"}`여야 한다. 실제 배포 기록에는 제품 버전, Git revision, API·웹 image ID/digest, 플러그인 Git SHA와 migration 결과를 남긴다.

## 제품 버전 업데이트

업데이트 전에 플랫폼 DB를 DB 제품의 표준 도구로 백업하고 현재 이미지 digest와 플러그인 SHA를 기록한다. 새 Release의 다섯 자산을 별도 디렉터리에 받아 checksum을 확인한 뒤 이미지를 load한다.

```bash
sha256sum --check SHA256SUMS
gzip -dc oss-scp-api-0.2.0.tar.gz | docker load
gzip -dc oss-scp-web-0.2.0.tar.gz | docker load
export OSS_SCP_VERSION=0.2.0
compose_file=oss-scp-0.2.0-compose.yaml
docker compose -f "$compose_file" config --quiet
docker compose -f "$compose_file" run --rm api \
  node node_modules/@oss-scp/platform-db/dist/migrate-cli.js
docker compose -f "$compose_file" up -d --force-recreate --wait api web
curl --fail http://127.0.0.1:3000/api/v1/ready
```

같은 Compose project에서 실행해야 기존 `platform_db_data` volume을 사용한다. 디렉터리를 옮겨 project 이름이 달라지는 경우 기존 project 이름을 확인해 `project_name`에 넣고 `docker compose -p "$project_name"`을 모든 명령에 동일하게 지정한다. 업데이트 후 외부 설정 mount, migration 이력과 기존 데이터가 유지되는지 확인한다.

## 플러그인 revision 교체

대상 플랫폼 이미지와 새 설정 revision의 조합을 비운영 환경에서 먼저 검증한다. 같은 이미지 버전을 유지한 채 `OSS_SCP_CONFIG_PATH`를 새 checkout으로 바꾸고 API만 재생성한다.

```bash
export OSS_SCP_CONFIG_PATH=/absolute/path/to/new-plugin-revision
docker compose -f "$compose_file" run --rm api \
  node node_modules/@oss-scp/plugin-config/dist/cli.js
docker compose -f "$compose_file" up -d --force-recreate --wait api
curl --fail http://127.0.0.1:3000/api/v1/ready
```

API는 호환되지 않는 설정을 DB 접속과 listen 전에 거부한다. 운영 시 TypeScript 변환, 의존성 설치 또는 원격 코드 다운로드는 수행하지 않는다.

## 실패 복구와 롤백

- 새 이미지 기동 전 migration 또는 설정 검증이 실패하면 이전 이미지 버전과 이전 설정 checkout을 유지하고 원인을 수정한다.
- migration 없이 실패했거나 이전 이미지가 새 DB schema와 호환되면 `OSS_SCP_VERSION`과 설정 경로를 이전 기록으로 되돌려 API·웹을 재생성한다.
- 새 migration이 이전 이미지와 호환되지 않으면 자동 down migration을 시도하지 않는다. 서비스를 중지하고 업데이트 전에 만든 DB 백업을 복원한 뒤 이전 이미지·설정 조합으로 기동한다.
- 같은 Git 태그의 Release는 덮어쓰지 않는다. 수정 릴리스는 새 commit과 새 버전 태그로 생성하고 checksum과 provenance를 다시 검증한다.

```bash
export OSS_SCP_VERSION=0.1.0
export OSS_SCP_CONFIG_PATH=/absolute/path/to/previous-plugin-revision
compose_file=oss-scp-0.1.0-compose.yaml
project_name=oss-scp
docker compose -p "$project_name" -f "$compose_file" up -d --force-recreate --wait api web
```
