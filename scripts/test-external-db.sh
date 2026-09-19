#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
project="oss-scp-external-check-$$"
database="${project}-database"
export API_PORT="${API_PORT:-18430}"
export PLATFORM_DB_HOST=host.docker.internal
export PLATFORM_DB_NAME=oss_scp
export PLATFORM_DB_USER=oss_scp_app
export OSS_SCP_CONFIG_PATH="$PWD"
database_password=external-test-password
export PLATFORM_DB_PASSWORD_FILE_HOST="$(mktemp /tmp/oss-scp-external-secret.XXXXXX)"
printf '%s' "$database_password" > "$PLATFORM_DB_PASSWORD_FILE_HOST"
# 로컬 Compose secret은 source 파일 권한을 유지하므로 비루트 API(UID 1000)가 읽을 수 있어야 한다.
chmod 0444 "$PLATFORM_DB_PASSWORD_FILE_HOST"
export PLATFORM_DB_TLS_MODE=disable
cleanup() {
  result=$?
  docker compose -p "$project" -f compose.external-db.yaml -f compose.external-db.secret.yaml down --remove-orphans >/dev/null 2>&1 || true
  docker rm -f "$database" >/dev/null 2>&1 || true
  rm -f "$PLATFORM_DB_PASSWORD_FILE_HOST"
  exit "$result"
}
trap cleanup EXIT
docker run -d --name "$database" -e POSTGRES_DB=oss_scp -e POSTGRES_USER=oss_scp_app \
  -e POSTGRES_PASSWORD="$database_password" -p 5432 postgres:17.6-bookworm >/dev/null
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$database" pg_isready -U oss_scp_app -d oss_scp >/dev/null 2>&1; then break; fi
  sleep 1
done
address=$(docker port "$database" 5432/tcp)
export PLATFORM_DB_PORT="${address##*:}"
docker compose -p "$project" -f compose.external-db.yaml -f compose.external-db.secret.yaml build api
docker compose -p "$project" -f compose.external-db.yaml -f compose.external-db.secret.yaml run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js | grep -q '6개 적용'
if ! docker compose -p "$project" -f compose.external-db.yaml -f compose.external-db.secret.yaml up --build -d --wait --wait-timeout 90 api; then
  docker compose -p "$project" -f compose.external-db.yaml -f compose.external-db.secret.yaml logs api
  exit 1
fi
test "$(curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/ready")" = '{"status":"ready"}'
docker compose -p "$project" -f compose.external-db.yaml -f compose.external-db.secret.yaml run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js | grep -q '0개 적용'
docker compose -p "$project" -f compose.external-db.yaml -f compose.external-db.secret.yaml down --remove-orphans
test "$(docker inspect --format '{{.State.Running}}' "$database")" = true
test "$(docker exec "$database" psql -U oss_scp_app -d oss_scp -Atc 'select count(*) from oss_scp_schema_migrations')" = 6
echo '외부 PostgreSQL: API·migration 연결 및 외부 DB 생명주기 비관리 통과'
