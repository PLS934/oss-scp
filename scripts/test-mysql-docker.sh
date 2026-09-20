#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

bundled_project="oss-scp-mysql-check-$$"
external_project="oss-scp-mysql-external-check-$$"
external_database="${external_project}-database"
export API_PORT="${API_PORT:-18530}"
export PLATFORM_DB_NAME=oss_scp
export PLATFORM_DB_USER=oss_scp_app
export PLATFORM_DB_PASSWORD=mysql-test-password
export OSS_SCP_CONFIG_PATH="$PWD"
export MYSQL_ROOT_PASSWORD=mysql-root-test-password
secret_file="$(mktemp /tmp/oss-scp-mysql-secret.XXXXXX)"
printf '%s' "$PLATFORM_DB_PASSWORD" > "$secret_file"
chmod 0444 "$secret_file"
export PLATFORM_DB_PASSWORD_FILE_HOST="$secret_file"

cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then
    docker compose -p "$external_project" -f compose.external-db.mysql.yaml -f compose.external-db.mysql.secret.yaml logs || true
    docker logs "$external_database" 2>/dev/null || true
    docker compose -p "$bundled_project" -f compose.mysql.yaml logs || true
  fi
  docker compose -p "$external_project" -f compose.external-db.mysql.yaml -f compose.external-db.mysql.secret.yaml down --remove-orphans >/dev/null 2>&1 || true
  docker rm -f "$external_database" >/dev/null 2>&1 || true
  docker compose -p "$bundled_project" -f compose.mysql.yaml down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$secret_file"
  exit "$result"
}
trap cleanup EXIT

node scripts/check-db-compose-config.mjs
docker compose -p "$bundled_project" -f compose.mysql.yaml build api
docker compose -p "$bundled_project" -f compose.mysql.yaml up -d --wait --wait-timeout 150 mysql
docker compose -p "$bundled_project" -f compose.mysql.yaml run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js | grep -q '10개 적용'
docker compose -p "$bundled_project" -f compose.mysql.yaml up -d --wait --wait-timeout 150 api
test "$(curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/health")" = '{"status":"ok"}'
test "$(curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/ready")" = '{"status":"ready"}'
docker compose -p "$bundled_project" -f compose.mysql.yaml run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js | grep -q '0개 적용'
docker compose -p "$bundled_project" -f compose.mysql.yaml stop mysql
test "$(curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/health")" = '{"status":"ok"}'
test "$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/ready")" = '503'
docker compose -p "$bundled_project" -f compose.mysql.yaml rm -f mysql
docker compose -p "$bundled_project" -f compose.mysql.yaml up -d --wait --wait-timeout 150 mysql api
test "$(docker compose -p "$bundled_project" -f compose.mysql.yaml exec -T mysql mysql -N -uoss_scp_app -p"$PLATFORM_DB_PASSWORD" oss_scp -e 'select count(*) from oss_scp_schema_migrations')" = '10'
test "$(docker inspect "${bundled_project}-mysql-1" --format '{{json .NetworkSettings.Ports}}')" = '{"3306/tcp":null,"33060/tcp":null}'

docker run -d --name "$external_database" -e MYSQL_DATABASE=oss_scp -e MYSQL_USER=oss_scp_app \
  -e MYSQL_PASSWORD="$PLATFORM_DB_PASSWORD" -e MYSQL_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD" -p 0.0.0.0::3306 mysql:8.4.6 >/dev/null
external_ready=false
for ((attempt=0; attempt<90; attempt++)); do
  if docker exec "$external_database" mysql -h 127.0.0.1 -uoss_scp_app -p"$PLATFORM_DB_PASSWORD" oss_scp -e 'SELECT 1' >/dev/null 2>&1; then
    external_ready=true
    break
  fi
  sleep 1
done
test "$external_ready" = true
address=$(docker port "$external_database" 3306/tcp)
export PLATFORM_DB_HOST=host.docker.internal
export PLATFORM_DB_PORT="${address##*:}"
export PLATFORM_DB_TLS_MODE=disable
export API_PORT=$((API_PORT + 1))
docker compose -p "$external_project" -f compose.external-db.mysql.yaml -f compose.external-db.mysql.secret.yaml run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js | grep -q '10개 적용'
docker compose -p "$external_project" -f compose.external-db.mysql.yaml -f compose.external-db.mysql.secret.yaml up --build -d --wait --wait-timeout 150 api
test "$(curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/ready")" = '{"status":"ready"}'
docker compose -p "$external_project" -f compose.external-db.mysql.yaml -f compose.external-db.mysql.secret.yaml run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js | grep -q '0개 적용'
docker compose -p "$external_project" -f compose.external-db.mysql.yaml -f compose.external-db.mysql.secret.yaml down --remove-orphans
test "$(docker inspect --format '{{.State.Running}}' "$external_database")" = true
test "$(docker exec "$external_database" mysql -N -uoss_scp_app -p"$PLATFORM_DB_PASSWORD" oss_scp -e 'select count(*) from oss_scp_schema_migrations')" = '10'
echo 'MySQL 내장/외부 연결·상태·migration·영속성과 외부 DB 생명주기 비관리 통과'
