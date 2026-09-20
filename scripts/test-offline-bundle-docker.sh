#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

temporary="$(mktemp -d "${TMPDIR:-/tmp}/oss-scp-bundle-smoke.XXXXXX")"
first_version=0.0.0; second_version=0.0.1
first_revision="$(printf 'a%.0s' {1..40})"; second_revision="$(printf 'b%.0s' {1..40})"
project="oss-scp-bundle-smoke-$$"
api_port=$((21000 + ($$ % 8000))); web_port=$((31000 + ($$ % 8000)))
external_containers=("")
external_projects=("")

configure() {
  local directory="$1"
  cp "$directory/env.example" "$directory/.env"
  sed -i.bak \
    -e "s#^COMPOSE_PROJECT_NAME=.*#COMPOSE_PROJECT_NAME=$project#" \
    -e "s#^OSS_SCP_CONFIG_PATH=.*#OSS_SCP_CONFIG_PATH=$PWD#" \
    -e 's#^PLATFORM_DB_PASSWORD=.*#PLATFORM_DB_PASSWORD=bundle-smoke-password#' \
    -e "s#^API_PORT=.*#API_PORT=$api_port#" \
    -e "s#^WEB_PORT=.*#WEB_PORT=$web_port#" \
    "$directory/.env"
  rm "$directory/.env.bak"; chmod 600 "$directory/.env"
}

cleanup() {
  result=$?
  if test -n "${second_bundle:-}" && test -f "$second_bundle/.env"; then docker compose --env-file "$second_bundle/.env" -f "$second_bundle/compose.yaml" down -v --remove-orphans >/dev/null 2>&1 || true; fi
  for external_project in "${external_projects[@]}"; do
    test -n "$external_project" || continue
    docker compose -p "$external_project" down --remove-orphans >/dev/null 2>&1 || true
    docker network rm "${external_project}_default" >/dev/null 2>&1 || true
  done
  for container in "${external_containers[@]}"; do test -z "$container" || docker rm -f "$container" >/dev/null 2>&1 || true; done
  docker image rm "oss-scp-api:$first_version" "oss-scp-web:$first_version" "oss-scp-api:$second_version" "oss-scp-web:$second_version" >/dev/null 2>&1 || true
  rm -rf -- "$temporary"
  exit "$result"
}
trap cleanup EXIT

pnpm build:plugin-transforms
for pair in "$first_version:$first_revision:first" "$second_version:$second_revision:second"; do
  IFS=: read -r version revision name <<<"$pair"
  scripts/build-release-assets.sh "$version" "$revision" "$temporary/$name-release"
  scripts/build-offline-bundles.sh "$version" "$revision" "$temporary/$name-release" "$temporary/$name-assets"
  node scripts/verify-offline-bundles.mjs "$version" "$revision" "$temporary/$name-assets"
  tar -xzf "$temporary/$name-assets/oss-scp-bundle-$version.tar.gz" -C "$temporary"
  tar -xzf "$temporary/$name-assets/oss-scp-bundle-$version-postgresql.tar.gz" -C "$temporary"
done
first_bundle="$temporary/oss-scp-bundle-$first_version-postgresql"
second_bundle="$temporary/oss-scp-bundle-$second_version-postgresql"
configure "$first_bundle"; configure "$second_bundle"

docker image rm "oss-scp-api:$first_version" "oss-scp-web:$first_version" "oss-scp-api:$second_version" "oss-scp-web:$second_version" postgres:17.6-bookworm >/dev/null 2>&1 || true
"$first_bundle/install.sh"
"$first_bundle/verify.sh" --query
docker compose --env-file "$first_bundle/.env" -f "$first_bundle/compose.yaml" exec -T postgres psql -U oss_scp_app -d oss_scp -c "CREATE TABLE bundle_smoke_marker(value text NOT NULL); INSERT INTO bundle_smoke_marker VALUES ('preserved');" >/dev/null
volume_before="$(docker inspect "$project-postgres-1" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')"

"$second_bundle/update.sh" --backup-confirmed
"$second_bundle/verify.sh" --query
test "$(docker inspect "$project-api-1" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')" = "$second_version"
test "$(docker inspect "$project-postgres-1" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')" = "$volume_before"
test "$(docker compose --env-file "$second_bundle/.env" -f "$second_bundle/compose.yaml" exec -T postgres psql -U oss_scp_app -d oss_scp -Atc 'SELECT value FROM bundle_smoke_marker')" = preserved

if "$first_bundle/rollback.sh" >"$temporary/rollback.out" 2>"$temporary/rollback.err"; then echo 'DB 복원 확인 없는 rollback을 거부해야 합니다' >&2; exit 1; fi
grep -q 'DB 복원' "$temporary/rollback.err"
"$first_bundle/rollback.sh" --database-restored
test "$(docker inspect "$project-api-1" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')" = "$first_version"
"$first_bundle/verify.sh"

docker compose --env-file "$second_bundle/.env" -f "$second_bundle/compose.yaml" down -v --remove-orphans >/dev/null

fixture_config="$temporary/config"
mkdir -p "$fixture_config/plugins/vulnerabilities-local-csv" "$fixture_config/connections" "$fixture_config/fixtures/csv"
cp -R plugins/vulnerabilities-local-csv/. "$fixture_config/plugins/vulnerabilities-local-csv/"
cp fixtures/csv/vulnerabilities.csv "$fixture_config/fixtures/csv/"
printf '{"plugins":["./vulnerabilities-local-csv"]}\n' >"$fixture_config/plugins/registry.json"
printf '{"connections":[]}\n' >"$fixture_config/connections/registry.json"

wait_for_records() {
  local port="$1" response attempt
  for attempt in {1..30}; do
    response="$(curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:$port/api/v1/records?pluginId=vulnerabilities-local-csv&sourceId=file%3Afixtures%2Fcsv%2Fvulnerabilities.csv&dataType=vulnerability&limit=20" 2>/dev/null || true)"
    if printf '%s' "$response" | grep -q '"items":\[{'; then printf '%s' "$response"; return; fi
    sleep 1
  done
  echo '대표 수집 결과를 기다리는 중 시간 초과' >&2; return 1
}

external_case() {
  local db_type="$1" suffix="$2" db_image="$3" db_port="$4"
  local ext_project="oss-scp-bundle-${suffix}-$$"
  local database="${ext_project}-database" network="${ext_project}_default"
  local first_external="$temporary/oss-scp-bundle-$first_version" second_external="$temporary/oss-scp-bundle-$second_version"
  local case_api_port=$((api_port + suffix * 10)) case_web_port=$((web_port + suffix * 10))
  local fail_web_port=$((case_web_port + 1))
  local password="bundle-${db_type}-password" marker="${db_type}-preserved" backup="$temporary/${db_type}-backup.sql"
  external_projects+=("$ext_project"); external_containers+=("$database")
  docker network create --label "com.docker.compose.project=$ext_project" --label com.docker.compose.network=default "$network" >/dev/null
  if test "$db_type" = postgres; then
    docker run -d --name "$database" --network "$network" -e POSTGRES_DB=oss_scp -e POSTGRES_USER=oss_scp_app -e POSTGRES_PASSWORD="$password" "$db_image" >/dev/null
    until docker exec "$database" pg_isready -U oss_scp_app -d oss_scp >/dev/null 2>&1; do sleep 1; done
  else
    docker run -d --name "$database" --network "$network" -e MYSQL_DATABASE=oss_scp -e MYSQL_USER=oss_scp_app -e MYSQL_PASSWORD="$password" -e MYSQL_ROOT_PASSWORD=root-test-password "$db_image" >/dev/null
    until docker run --rm --network "$network" "$db_image" mysqladmin ping -h "$database" -uoss_scp_app -p"$password" --silent >/dev/null 2>&1; do sleep 1; done
  fi

  for entry in "$first_external:$first_version:$case_api_port:$case_web_port" "$second_external:$second_version:$case_api_port:$case_web_port"; do
    IFS=: read -r directory version configured_api configured_web <<<"$entry"
    cp "$directory/env.example" "$directory/.env"
    sed -i.bak \
      -e "s#^COMPOSE_PROJECT_NAME=.*#COMPOSE_PROJECT_NAME=$ext_project#" \
      -e "s#^OSS_SCP_CONFIG_PATH=.*#OSS_SCP_CONFIG_PATH=$fixture_config#" \
      -e "s#^PLATFORM_DB_TYPE=.*#PLATFORM_DB_TYPE=$db_type#" \
      -e "s#^PLATFORM_DB_HOST=.*#PLATFORM_DB_HOST=$database#" \
      -e "s#^PLATFORM_DB_PORT=.*#PLATFORM_DB_PORT=$db_port#" \
      -e 's#^PLATFORM_DB_NAME=.*#PLATFORM_DB_NAME=oss_scp#' \
      -e 's#^PLATFORM_DB_USER=.*#PLATFORM_DB_USER=oss_scp_app#' \
      -e "s#^PLATFORM_DB_PASSWORD=.*#PLATFORM_DB_PASSWORD=$password#" \
      -e 's#^PLATFORM_DB_TLS_MODE=.*#PLATFORM_DB_TLS_MODE=disable#' \
      -e "s#^API_PORT=.*#API_PORT=$configured_api#" \
      -e "s#^WEB_PORT=.*#WEB_PORT=$configured_web#" "$directory/.env"
    rm "$directory/.env.bak"; chmod 600 "$directory/.env"
  done

  "$first_external/install.sh"
  local list record_id
  list="$(wait_for_records "$case_api_port")"
  record_id="$(printf '%s' "$list" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).items[0].id))")"
  curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:$case_api_port/api/v1/records/$record_id" | grep -q '"pluginId":"vulnerabilities-local-csv"'
  local config_before migration_count
  config_before="$(docker inspect "${ext_project}-api-1" --format '{{range .Mounts}}{{if eq .Destination "/config"}}{{.Source}}{{end}}{{end}}')"
  if test "$db_type" = postgres; then
    docker exec "$database" psql -U oss_scp_app -d oss_scp -c "CREATE TABLE bundle_smoke_marker(value text NOT NULL); INSERT INTO bundle_smoke_marker VALUES ('$marker');" >/dev/null
    docker exec "$database" pg_dump -U oss_scp_app --clean --if-exists oss_scp >"$backup"
  else
    docker exec "$database" mysql -uoss_scp_app -p"$password" oss_scp -e "CREATE TABLE bundle_smoke_marker(value varchar(64) NOT NULL); INSERT INTO bundle_smoke_marker VALUES ('$marker');"
    docker exec "$database" mysqldump -uoss_scp_app -p"$password" --no-tablespaces --add-drop-table oss_scp >"$backup"
  fi

  "$second_external/update.sh" --backup-confirmed
  test "$(docker inspect "${ext_project}-api-1" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')" = "$second_version"
  test "$(docker inspect "${ext_project}-api-1" --format '{{range .Mounts}}{{if eq .Destination "/config"}}{{.Source}}{{end}}{{end}}')" = "$config_before"
  if test "$db_type" = postgres; then
    test "$(docker exec "$database" psql -U oss_scp_app -d oss_scp -Atc 'SELECT value FROM bundle_smoke_marker')" = "$marker"
    migration_count="$(docker exec "$database" psql -U oss_scp_app -d oss_scp -Atc 'SELECT count(*) FROM oss_scp_schema_migrations')"
  else
    test "$(docker exec "$database" mysql -N -uoss_scp_app -p"$password" oss_scp -e 'SELECT value FROM bundle_smoke_marker')" = "$marker"
    migration_count="$(docker exec "$database" mysql -N -uoss_scp_app -p"$password" oss_scp -e 'SELECT count(*) FROM oss_scp_schema_migrations')"
  fi
  if test "$db_type" = postgres; then test "$migration_count" = 10; else test "$migration_count" = 15; fi

  cp "$first_external/README.md" "$temporary/README.$db_type"
  printf '\nchanged\n' >>"$first_external/README.md"
  if "$first_external/update.sh" --backup-confirmed >"$temporary/pre-$db_type.out" 2>"$temporary/pre-$db_type.err"; then echo 'migration 전 변경 파일을 거부해야 합니다' >&2; return 1; fi
  grep -q 'checksum' "$temporary/pre-$db_type.err"
  test "$(docker inspect "${ext_project}-api-1" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')" = "$second_version"
  mv "$temporary/README.$db_type" "$first_external/README.md"

  sed -i.bak "s#^WEB_PORT=.*#WEB_PORT=$fail_web_port#" "$first_external/.env"; rm "$first_external/.env.bak"
  local blocker="${ext_project}-port-blocker"; external_containers+=("$blocker")
  docker run -d --name "$blocker" -p "0.0.0.0:$fail_web_port:8080" -e API_UPSTREAM=127.0.0.1:1 "oss-scp-web:$first_version" >/dev/null
  if "$first_external/update.sh" --backup-confirmed >"$temporary/post-$db_type.out" 2>"$temporary/post-$db_type.err"; then echo 'migration 이후 기동 실패가 필요합니다' >&2; return 1; fi
  grep -q '오류\[recreate\]' "$temporary/post-$db_type.err"
  docker rm -f "$blocker" >/dev/null
  docker compose --env-file "$first_external/.env" -f "$first_external/compose.yaml" stop api web >/dev/null 2>&1 || true
  if test "$db_type" = postgres; then
    docker exec -i "$database" psql -U oss_scp_app -d oss_scp <"$backup" >/dev/null
  else
    docker exec -i "$database" mysql -uoss_scp_app -p"$password" oss_scp <"$backup"
  fi
  "$second_external/rollback.sh" --database-restored
  test "$(docker inspect "${ext_project}-api-1" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')" = "$second_version"
  wait_for_records "$case_api_port" >/dev/null
  docker compose --env-file "$second_external/.env" -f "$second_external/compose.yaml" down --remove-orphans >/dev/null
  docker rm -f "$database" >/dev/null
  docker network rm "$network" >/dev/null 2>&1 || true
}

external_case postgres 1 postgres:17.6-bookworm 5432
external_case mysql 2 mysql:8.4.6 3306

echo 'PostgreSQL 포함 및 외부 PostgreSQL·MySQL 번들의 설치·수집·조회·업데이트·백업 복원 경계: 통과'
