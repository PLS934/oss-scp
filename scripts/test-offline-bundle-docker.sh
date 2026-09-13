#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

temporary="$(mktemp -d "${TMPDIR:-/tmp}/oss-scp-bundle-smoke.XXXXXX")"
first_version=0.0.0; second_version=0.0.1
first_revision="$(printf 'a%.0s' {1..40})"; second_revision="$(printf 'b%.0s' {1..40})"
project="oss-scp-bundle-smoke-$$"
api_port=$((21000 + ($$ % 8000))); web_port=$((31000 + ($$ % 8000)))

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

echo 'PostgreSQL 포함 번들 최초 설치·업데이트·volume/데이터 보존·롤백 경계: 통과'
