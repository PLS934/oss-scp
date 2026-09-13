#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

temporary="$(mktemp -d "${TMPDIR:-/tmp}/oss-scp-release-smoke.XXXXXX")"
first="$temporary/first"
second="$temporary/second"
project="oss-scp-release-$$"
first_version="0.0.0"
second_version="0.0.1"
first_revision="$(printf 'a%.0s' {1..40})"
second_revision="$(printf 'b%.0s' {1..40})"
export OSS_SCP_CONFIG_PATH="$PWD"
export PLATFORM_DB_PASSWORD="release-smoke-password"
export API_PORT=$((20000 + ($$ % 10000)))
export WEB_PORT=$((30000 + ($$ % 10000)))

cleanup() {
  result=$?
  OSS_SCP_VERSION="$second_version" docker compose -p "$project" -f "$second/oss-scp-${second_version}-compose.yaml" down -v --remove-orphans >/dev/null 2>&1 || true
  OSS_SCP_VERSION="$first_version" docker compose -p "$project" -f "$first/oss-scp-${first_version}-compose.yaml" down -v --remove-orphans >/dev/null 2>&1 || true
  docker image rm "oss-scp-api:${first_version}" "oss-scp-web:${first_version}" "oss-scp-api:${second_version}" "oss-scp-web:${second_version}" >/dev/null 2>&1 || true
  rm -rf -- "$temporary"
  exit "$result"
}
trap cleanup EXIT

pnpm build:plugin-transforms
bash scripts/build-release-assets.sh "$first_version" "$first_revision" "$first"
bash scripts/build-release-assets.sh "$second_version" "$second_revision" "$second"

for directory in "$first" "$second"; do
  (cd "$directory" && shasum -a 256 -c SHA256SUMS)
done

docker image rm "oss-scp-api:${first_version}" "oss-scp-web:${first_version}" "oss-scp-api:${second_version}" "oss-scp-web:${second_version}"
gzip -dc "$first/oss-scp-api-${first_version}.tar.gz" | docker load
gzip -dc "$first/oss-scp-web-${first_version}.tar.gz" | docker load

export OSS_SCP_VERSION="$first_version"
first_compose="$first/oss-scp-${first_version}-compose.yaml"
docker compose -p "$project" -f "$first_compose" up -d --wait --wait-timeout 90 postgres
docker compose -p "$project" -f "$first_compose" run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js | grep -q '4개 적용'
docker compose -p "$project" -f "$first_compose" up -d --wait --wait-timeout 90 api web
test "$(curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/health")" = '{"status":"ok"}'
test "$(curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/ready")" = '{"status":"ready"}'
curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${WEB_PORT}/" | grep -q '<div id="root">'
docker compose -p "$project" -f "$first_compose" exec -T web grep -R -q "$first_version" /usr/share/nginx/html/assets
docker compose -p "$project" -f "$first_compose" exec -T postgres psql -U oss_scp_app -d oss_scp -c 'CREATE TABLE release_smoke_marker(value text NOT NULL); INSERT INTO release_smoke_marker VALUES ('"'"'preserved'"'"');' >/dev/null
volume_before="$(docker inspect "${project}-postgres-1" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')"
config_before="$(docker inspect "${project}-api-1" --format '{{range .Mounts}}{{if eq .Destination "/config"}}{{.Source}}{{end}}{{end}}')"

gzip -dc "$second/oss-scp-api-${second_version}.tar.gz" | docker load
gzip -dc "$second/oss-scp-web-${second_version}.tar.gz" | docker load
export OSS_SCP_VERSION="$second_version"
second_compose="$second/oss-scp-${second_version}-compose.yaml"
docker compose -p "$project" -f "$second_compose" run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js | grep -q '0개 적용'
docker compose -p "$project" -f "$second_compose" up -d --force-recreate --wait --wait-timeout 90 api web

test "$(docker inspect "${project}-api-1" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')" = "$second_version"
test "$(docker inspect "${project}-web-1" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')" = "$second_version"
test "$(docker inspect "${project}-postgres-1" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')" = "$volume_before"
test "$(docker inspect "${project}-api-1" --format '{{range .Mounts}}{{if eq .Destination "/config"}}{{.Source}}{{end}}{{end}}')" = "$config_before"
test "$(docker compose -p "$project" -f "$second_compose" exec -T postgres psql -U oss_scp_app -d oss_scp -Atc 'SELECT value FROM release_smoke_marker')" = 'preserved'
test "$(docker compose -p "$project" -f "$second_compose" exec -T postgres psql -U oss_scp_app -d oss_scp -Atc 'SELECT count(*) FROM oss_scp_schema_migrations')" = '4'
test "$(curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/ready")" = '{"status":"ready"}'
docker compose -p "$project" -f "$second_compose" exec -T web grep -R -q "$second_version" /usr/share/nginx/html/assets

echo '릴리스 자산 최초 설치·migration·두 버전 업데이트·DB/설정 보존: 통과'
