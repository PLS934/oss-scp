# 폐쇄망 번들 설치·업데이트·복구

GitHub Release는 같은 제품 버전에 두 가지 단일 서버용 번들을 제공합니다.

| 자산 | 선택 기준 | 포함 이미지 |
| --- | --- | --- |
| `oss-scp-bundle-<version>.tar.gz` | 별도 운영 PostgreSQL 17.6 또는 MySQL 8.4.6 사용 | API, 웹 |
| `oss-scp-bundle-<version>-postgresql.tar.gz` | 번들이 관리하는 PostgreSQL 17.6 volume 사용 | API, 웹, PostgreSQL |

지원 기준은 Ubuntu 24.04, `linux/amd64`, Docker Engine과 Compose v2다. 대상 서버는 Registry에 연결하지 않아도 되지만 Docker와 `curl`, `sha256sum`은 미리 설치되어 있어야 한다. 운영자 플러그인·Connection 설정, 비밀정보와 TypeScript·`.tsx` 원본은 번들에 포함되지 않는다. React 화면은 제품 웹 이미지에 미리 빌드된 공통 화면만 제공한다.

## 반입과 최초 설치

Release에서 선택한 번들과 외부 `SHA256SUMS`를 내려받아 archive checksum을 먼저 확인한다. 외부 파일에는 두 번들이 모두 기록되므로 선택한 번들의 행만 검증할 수 있다. 압축을 푼 뒤의 내부 `SHA256SUMS`는 `images.tar`, Compose, 매니페스트와 실행 파일이 반입 과정에서 바뀌지 않았는지 검증한다. 매니페스트의 이미지별 `digest`는 OCI manifest를, `configDigest`는 Docker image config를 식별하며 설치 스크립트는 Engine이 반환하는 실제 image ID를 둘 모두와 대조한다. 검증 대상이 서로 다르므로 생략하지 않는다.

```bash
grep 'oss-scp-bundle-0.1.0.tar.gz$' SHA256SUMS | sha256sum --check
tar -xzf oss-scp-bundle-0.1.0.tar.gz
cd oss-scp-bundle-0.1.0
sha256sum --check --strict SHA256SUMS
cp env.example .env
```

별도 Git checkout이나 승인된 배포물로 `plugins/`, `connections/` 및 각 `registry.json`을 갖춘 설정 디렉터리를 준비하고 `.env`의 `OSS_SCP_CONFIG_PATH`에 절대 경로를 적는다. TypeScript 플러그인은 반입 전에 JavaScript로 빌드해야 한다. DB 비밀번호는 Git이나 번들에 넣지 말고 접근 권한을 제한한 `.env` 또는 실행 환경으로 전달한다.

기본 번들은 DBA가 먼저 빈 database와 전용 계정을 만들어야 한다. 계정에는 database 연결과 대상 schema 사용·객체 생성 및 이후 migration에 필요한 변경 권한이 있어야 한다. 컨테이너의 `localhost`는 DB 호스트가 아니므로 `PLATFORM_DB_HOST`에는 컨테이너에서 접근 가능한 DNS 이름 또는 IP를 넣는다. 기존 데이터가 있는 database를 초기 설치 대상으로 사용하지 않는다.

PostgreSQL 포함 번들은 `.env`의 강한 비밀번호를 설정하면 전용 volume과 빈 database를 처음 기동한다. 두 방식 모두 설치 스크립트가 설정과 이미지를 검증하고 명시적으로 migration을 실행한 다음 API·웹을 `--pull never`로 기동한다.

```bash
chmod 600 .env
./install.sh
./verify.sh --query
```

## 업데이트

새 번들을 별도 디렉터리에 풀고 기존 `.env` 및 같은 설정 revision을 연결한다. 업데이트 전에 DB 표준 도구로 백업하고 복구 시험 또는 백업 조회를 완료한다. 스크립트는 DB를 백업하거나 복원하지 않는다.

PostgreSQL 예시:

```bash
pg_dump --format=custom --dbname="$DATABASE_URL" --file=oss-scp-before-update.dump
pg_restore --list oss-scp-before-update.dump >/dev/null
```

MySQL 예시:

```bash
mysqldump --single-transaction --routines --triggers --host="$PLATFORM_DB_HOST" --user="$PLATFORM_DB_USER" --password "$PLATFORM_DB_NAME" > oss-scp-before-update.sql
test -s oss-scp-before-update.sql
```

백업 확인을 명시한 뒤 업데이트한다. 새 번들은 파일·설정·이미지를 먼저 검증하고, migration 후 컨테이너를 강제 재생성하여 실제 실행 버전과 Git revision을 확인한다. 기존 DB와 PostgreSQL volume, 외부 설정 경로는 삭제하지 않는다.

```bash
./update.sh --backup-confirmed
./verify.sh --query
```

## 실패와 복구

checksum·설정·이미지·DB 연결처럼 migration 전 검증이 실패하면 현재 실행 중인 배포를 유지하고 원인을 수정한다. migration이 시작된 뒤 실패했다면 코드만 이전 버전으로 바꾸지 않는다. 먼저 표준 도구로 업데이트 전 DB를 복원한 후 이전 번들 디렉터리에서 다음을 실행한다.

```bash
# PostgreSQL: 새 빈 DB를 준비한 뒤
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" oss-scp-before-update.dump

# MySQL: 새 빈 DB를 준비한 뒤
mysql --host="$PLATFORM_DB_HOST" --user="$PLATFORM_DB_USER" --password "$PLATFORM_DB_NAME" < oss-scp-before-update.sql

./rollback.sh --database-restored
./verify.sh --query
```

`rollback.sh`는 migration 시작 기록이 있으면 `--database-restored` 확인 없이는 중단한다. 자동 down migration이나 자동 DB 복원은 하지 않는다. 운영 배포 기록에는 제품 버전, 전체 Git revision, 이미지 digest, 설정 Git revision, DB backup 식별자와 migration 결과를 함께 남긴다.
