#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# 별도 프로젝트와 임시 컨테이너만 생성하고 정리합니다.
project="oss-scp-check-$$"
standalone="${project}-standalone"
unresponsive="${project}-unresponsive"
export API_PORT="${API_PORT:-18300}"
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then
    docker compose -p "$project" logs || true
    docker logs "$standalone" 2>/dev/null || true
    docker inspect "$unresponsive" 2>/dev/null || true
  fi
  docker rm -f "$standalone" "$unresponsive" >/dev/null 2>&1 || true
  docker compose -p "$project" down --remove-orphans >/dev/null 2>&1 || true
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
docker compose -p "$project" config --quiet
docker compose -p "$project" up --build -d --wait --wait-timeout 90
check_response "http://127.0.0.1:${API_PORT}"
docker run -d --name "$standalone" -p 127.0.0.1::3000 oss-scp-api:local >/dev/null
wait_health "$standalone" healthy
address=$(docker port "$standalone" 3000/tcp)
check_response "http://${address}"
test "$(docker inspect --format '{{len .Mounts}}' "$standalone")" = 0
docker exec "$standalone" node -e '
const fs = require("node:fs");
if (process.getuid() === 0) throw new Error("루트 사용자 실행");
for (const p of ["src", ".env", ".git", "node_modules/typescript", "node_modules/@nestjs/cli"]) {
  if (fs.existsSync(p)) throw new Error(`런타임 제외 파일 포함: ${p}`);
}
'
# HTTP 연결은 받지만 응답을 끝내지 않는 서버로 healthcheck timeout을 검증합니다.
docker run -d --name "$unresponsive" oss-scp-api:local \
  node -e 'require("node:http").createServer(() => {}).listen(3000, "0.0.0.0")' >/dev/null
wait_health "$unresponsive" unhealthy
echo 'Compose·이미지 단독 실행·포트·비루트·볼륨/개발 의존성 제외·무응답 unhealthy: 통과'
