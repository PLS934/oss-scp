#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# 별도 프로젝트와 임시 컨테이너만 생성하고 정리합니다.
project="oss-scp-check-$$"
standalone="${project}-standalone"
unresponsive="${project}-unresponsive"
invalid_revision="${project}-invalid-revision"
scheduled_peer="${project}-scheduled-peer"
config_revision_root="$(mktemp -d "${TMPDIR:-/tmp}/oss-scp-config-revision.XXXXXX")"
chmod 0755 "$config_revision_root"
export API_PORT="${API_PORT:-18300}"
export PLATFORM_DB_PASSWORD="${PLATFORM_DB_PASSWORD:-docker-test-password}"
export OSS_SCP_CONFIG_PATH="$PWD"
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then
    docker compose -p "$project" logs || true
    docker logs "$standalone" 2>/dev/null || true
    docker inspect "$unresponsive" 2>/dev/null || true
    docker logs "$invalid_revision" 2>/dev/null || true
  fi
  docker rm -f "$standalone" "$unresponsive" "$invalid_revision" "$scheduled_peer" >/dev/null 2>&1 || true
  docker compose -p "$project" down -v --remove-orphans >/dev/null 2>&1 || true
  if [ -n "$config_revision_root" ] && [ -d "$config_revision_root" ]; then rm -rf -- "$config_revision_root"; fi
  exit "$result"
}
trap cleanup EXIT
check_response() {
  test "$(curl --fail --silent --show-error --max-time 5 "$1/api/v1/health")" = '{"status":"ok"}'
}
wait_health() {
  for ((attempt=0; attempt<60; attempt++)); do
    state=$(docker inspect --format '{{.State.Health.Status}}' "$1")
    if [ "$state" = "$2" ]; then return 0; fi
    sleep 1
  done
  echo "상태 대기 시간 초과: $1 → $2" >&2
  return 1
}
node scripts/check-db-compose-config.mjs
pnpm build:plugin-transforms
docker compose -p "$project" config --quiet
docker compose -p "$project" build api
docker compose -p "$project" -f compose.external-db.yaml config --format json | node -e '
let value=""; process.stdin.on("data", chunk => value += chunk); process.stdin.on("end", () => {
  const config=JSON.parse(value); const services=Object.keys(config.services).sort();
  if (JSON.stringify(services) !== JSON.stringify(["api","web"]) || config.volumes) process.exit(1);
});'
docker compose -p "$project" up --build -d --wait --wait-timeout 90 postgres
api_image_id="$(docker image inspect oss-scp-api:local --format '{{.Id}}')"
web_image_id="$(docker image inspect oss-scp-web:local --format '{{.Id}}')"
docker compose -p "$project" run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js | grep -q '10개 적용'
docker compose -p "$project" up -d --wait --wait-timeout 90 api
check_response "http://127.0.0.1:${API_PORT}"
curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/plugin-menus" | grep -q 'sample1-offset-api'
docker compose -p "$project" run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js | grep -q '0개 적용'
for ((attempt=0; attempt<30; attempt++)); do
  status=$(curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/collection-status")
  if printf '%s' "$status" | grep -q '"pluginId":"vulnerabilities-local-csv"' && printf '%s' "$status" | grep -q '"status":"success"'; then break; fi
  sleep 1
done
printf '%s' "$status" | grep -q '"status":"success"'
docker compose -p "$project" run --rm api node node_modules/@oss-scp/collector-cli/dist/process.js vulnerabilities-local-csv \
  | node -e 'let value=""; process.stdin.on("data", chunk => value += chunk); process.stdin.on("end", () => { const event=JSON.parse(value); if (event.status !== "success" || event.pluginId !== "vulnerabilities-local-csv") process.exit(1); });'
docker compose -p "$project" stop postgres
docker compose -p "$project" rm -f postgres
docker compose -p "$project" up -d --wait --wait-timeout 90 postgres api
test "$(docker compose -p "$project" exec -T postgres psql -U oss_scp_app -d oss_scp -Atc 'select count(*) from oss_scp_schema_migrations')" = 10
test "$(docker inspect "${project}-postgres-1" --format '{{json .NetworkSettings.Ports}}')" = '{"5432/tcp":null}'
docker run -d --name "$standalone" --network "${project}_default" -p 127.0.0.1::3000 \
  -v "$OSS_SCP_CONFIG_PATH:/config:ro" -e OSS_SCP_CONFIG_ROOT=/config \
  -e PLATFORM_DB_TYPE=postgres -e PLATFORM_DB_HOST=postgres -e PLATFORM_DB_PORT=5432 \
  -e PLATFORM_DB_NAME=oss_scp -e PLATFORM_DB_USER=oss_scp_app -e PLATFORM_DB_PASSWORD="$PLATFORM_DB_PASSWORD" \
  -e PLATFORM_DB_TLS_MODE=disable oss-scp-api:local >/dev/null
wait_health "$standalone" healthy
address=$(docker port "$standalone" 3000/tcp)
check_response "http://${address}"
test "$(docker inspect --format '{{len .Mounts}}' "$standalone")" = 1
docker exec "$standalone" node -e '
const fs = require("node:fs");
if (process.getuid() === 0) throw new Error("루트 사용자 실행");
for (const p of ["src", ".env", ".git", "node_modules/typescript", "node_modules/@nestjs/cli"]) {
  if (fs.existsSync(p)) throw new Error(`런타임 제외 파일 포함: ${p}`);
}
for (const p of ["apps", "plugins", "connections", "fixtures", "node_modules/typescript", "node_modules/@nestjs/cli"]) {
  if (fs.existsSync(p)) throw new Error(`런타임 개발 파일 포함: ${p}`);
}
for (const p of ["node_modules/@oss-scp/collector-cli/dist/process.js", "node_modules/@oss-scp/plugin-config/schemas/plugin.schema.json"]) {
  if (!fs.existsSync(p)) throw new Error(`CLI 런타임 파일 누락: ${p}`);
}
'
# API 이미지를 다시 만들지 않고 외부 설정 revision만 교체합니다. 디렉터리명도 plugin id와 다르게 둡니다.
cp -R plugins connections fixtures "$config_revision_root/"
mv "$config_revision_root/plugins/sample1-offset-api" "$config_revision_root/plugins/server-assets-revision-b"
CONFIG_REVISION_ROOT="$config_revision_root" node -e '
const fs = require("node:fs");
const root = process.env.CONFIG_REVISION_ROOT;
const registryFile = `${root}/plugins/registry.json`;
const registry = JSON.parse(fs.readFileSync(registryFile, "utf8"));
registry.plugins = registry.plugins.map(value => value === "./sample1-offset-api" ? "./server-assets-revision-b" : value);
fs.writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`);
for (const directory of ["server-assets-revision-b", "vulnerabilities-local-csv"]) {
  const file = `${root}/plugins/${directory}/plugin.json`;
  const plugin = JSON.parse(fs.readFileSync(file, "utf8"));
  plugin.version = "0.2.0";
  if (directory === "server-assets-revision-b") {
    plugin.name = "Server Assets Revision B";
    plugin.menu.title = "서버 자산 B";
  }
  fs.writeFileSync(file, `${JSON.stringify(plugin, null, 2)}\n`);
}
'
export OSS_SCP_CONFIG_PATH="$config_revision_root"
docker compose -p "$project" up -d --force-recreate --wait --wait-timeout 90 api
test "$(docker image inspect oss-scp-api:local --format '{{.Id}}')" = "$api_image_id"
test "$(docker image inspect oss-scp-web:local --format '{{.Id}}')" = "$web_image_id"
curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/plugin-menus" | grep -q '서버 자산 B'
docker compose -p "$project" run --rm api node node_modules/@oss-scp/collector-cli/dist/process.js vulnerabilities-local-csv \
  | node -e 'let value=""; process.stdin.on("data", chunk => value += chunk); process.stdin.on("end", () => { const event=JSON.parse(value); if (event.status !== "success" || event.accepted < 1) process.exit(1); });'

# 같은 읽기 전용 revision의 collection.schedule을 UTC 다음 발생으로 주입하고 scheduled 이력을 확인합니다.
CONFIG_REVISION_ROOT="$config_revision_root" node -e '
const fs = require("node:fs");
const file = `${process.env.CONFIG_REVISION_ROOT}/plugins/registry.json`;
const registry = JSON.parse(fs.readFileSync(file, "utf8"));
const due = new Date(Date.now() + 120000);
registry.collection = { schedule: { enabled: true, timezone: "UTC", time: `${String(due.getUTCHours()).padStart(2, "0")}:${String(due.getUTCMinutes()).padStart(2, "0")}` } };
fs.writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`);
'
docker compose -p "$project" up -d --force-recreate --wait --wait-timeout 90 api
docker run -d --name "$scheduled_peer" --network "${project}_default" \
  -v "$config_revision_root:/config:ro" -e OSS_SCP_CONFIG_ROOT=/config \
  -e PLATFORM_DB_TYPE=postgres -e PLATFORM_DB_HOST=postgres -e PLATFORM_DB_PORT=5432 \
  -e PLATFORM_DB_NAME=oss_scp -e PLATFORM_DB_USER=oss_scp_app -e PLATFORM_DB_PASSWORD="$PLATFORM_DB_PASSWORD" \
  -e PLATFORM_DB_TLS_MODE=disable oss-scp-api:local >/dev/null
wait_health "$scheduled_peer" healthy
# 빠른 로컬 fixture 수집의 실행 시간이 호스트 성능에 따라 달라져도 두 scheduler가
# 동일한 fresh lease winner를 관찰하도록 고정합니다. 이후 reference는 실제 child
# process와 DB 경계를 통과해 저장되어야 합니다.
docker compose -p "$project" exec -T postgres psql -U oss_scp_app -d oss_scp -v ON_ERROR_STOP=1 -c "
  INSERT INTO collection_runs
    (plugin_id, source_id, scope_type, scope_key, config_revision, started_at, heartbeat_at,
     coordinated, trigger, scheduled_at, schedule_timezone)
  VALUES
    ('sample1-offset-api', 'mock-api-sample1', 'full', '', 'docker-smoke-active-lease', now(), now(),
     true, 'scheduled', now(), 'UTC');
" >/dev/null
for ((attempt=0; attempt<150; attempt++)); do
  scheduled_count=$(docker compose -p "$project" exec -T postgres psql -U oss_scp_app -d oss_scp -Atc "SELECT count(*) FROM collection_runs WHERE trigger='scheduled' AND schedule_timezone='UTC' AND config_revision <> 'docker-smoke-active-lease'")
  if [ "$scheduled_count" -gt 0 ]; then break; fi
  sleep 1
done
test "$scheduled_count" -gt 0
for ((attempt=0; attempt<30; attempt++)); do
  reference_count=$(docker compose -p "$project" exec -T postgres psql -U oss_scp_app -d oss_scp -Atc "SELECT count(*) FROM scheduled_collection_references r JOIN collection_runs c ON c.id=r.active_run_id WHERE r.schedule_timezone='UTC' AND c.trigger='scheduled'")
  if [ "$reference_count" -gt 0 ]; then break; fi
  sleep 1
done
test "$reference_count" -gt 0
docker rm -f "$scheduled_peer" >/dev/null

# 잘못된 revision은 DB 접속 시도보다 먼저 preflight에서 중단되어야 합니다.
cp "$config_revision_root/plugins/vulnerabilities-local-csv/dist/transform.js" "$config_revision_root/valid-transform.js"
printf '%s\n' 'module.exports = {};' > "$config_revision_root/plugins/vulnerabilities-local-csv/dist/transform.js"
docker run --name "$invalid_revision" --network "${project}_default" \
  -v "$config_revision_root:/config:ro" -e OSS_SCP_CONFIG_ROOT=/config \
  -e PLATFORM_DB_TYPE=postgres -e PLATFORM_DB_HOST=does-not-exist -e PLATFORM_DB_PORT=5432 \
  -e PLATFORM_DB_NAME=oss_scp -e PLATFORM_DB_USER=oss_scp_app -e PLATFORM_DB_PASSWORD=unused \
  -e PLATFORM_DB_TLS_MODE=disable oss-scp-api:local >/dev/null 2>&1 || true
test "$(docker inspect --format '{{.State.ExitCode}}' "$invalid_revision")" != 0
docker logs "$invalid_revision" 2>&1 | grep -q '플러그인 설정 검증 실패'
if docker logs "$invalid_revision" 2>&1 | grep -q '플랫폼 DB에 연결할 수 없습니다'; then exit 1; fi
# 이전에 검증한 설정 revision으로 돌아가면 같은 이미지로 다시 기동됩니다.
mv "$config_revision_root/valid-transform.js" "$config_revision_root/plugins/vulnerabilities-local-csv/dist/transform.js"
docker compose -p "$project" up -d --force-recreate --wait --wait-timeout 90 api
test "$(docker image inspect oss-scp-api:local --format '{{.Id}}')" = "$api_image_id"
curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/plugin-menus" | grep -q '서버 자산 B'
# HTTP 연결은 받지만 응답을 끝내지 않는 서버로 healthcheck timeout을 검증합니다.
docker run -d --name "$unresponsive" \
  --health-cmd="node healthcheck.mjs" --health-interval=1s --health-timeout=1s --health-retries=2 oss-scp-api:local \
  node -e 'require("node:http").createServer(() => {}).listen(3000, "0.0.0.0")' >/dev/null
wait_health "$unresponsive" unhealthy
echo 'Compose·다중 인스턴스 일일 UTC schedule/duplicate 참조·동일 이미지 설정 revision 교체·preflight 기동 차단·수동 수집·비루트·볼륨/개발 의존성 제외·무응답 unhealthy: 통과'
