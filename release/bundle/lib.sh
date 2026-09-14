#!/usr/bin/env bash
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${OSS_SCP_ENV_FILE:-$BUNDLE_DIR/.env}"
STATE_DIR="${OSS_SCP_STATE_DIR:-$(dirname "$BUNDLE_DIR")/.oss-scp-state}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$BUNDLE_DIR/compose.yaml")

fail() { printf '오류[%s]: %s\n' "$1" "$2" >&2; exit "${3:-1}"; }
need() { command -v "$1" >/dev/null 2>&1 || fail prerequisites "$1 명령이 필요합니다" 2; }
manifest_value() { sed -n "s/^[[:space:]]*\"$1\": \"\([^\"]*\)\".*/\1/p" "$BUNDLE_DIR/manifest.json" | head -n 1; }

verify_files() {
  need sha256sum; need docker
  test -f "$ENV_FILE" || fail environment "환경 파일이 없습니다: $ENV_FILE" 2
  (cd "$BUNDLE_DIR" && sha256sum --check --strict SHA256SUMS) || fail checksum '번들 파일 checksum이 일치하지 않습니다'
  docker compose version >/dev/null 2>&1 || fail prerequisites 'Docker Compose v2가 필요합니다' 2
  "${COMPOSE[@]}" config --quiet || fail compose '환경변수 또는 Compose 구성이 유효하지 않습니다'
}

load_images() { docker load --input "$BUNDLE_DIR/images.tar" >/dev/null || fail images 'images.tar를 load하지 못했습니다'; }

verify_image() {
  local name="$1" reference expected_digest expected_config_digest version revision actual_digest actual_version actual_revision
  reference="$(manifest_value "${name}Reference")"
  expected_digest="$(manifest_value "${name}Digest")"
  expected_config_digest="$(manifest_value "${name}ConfigDigest")"
  version="$(manifest_value productVersion)"; revision="$(manifest_value gitRevision)"
  test -n "$reference" || fail manifest "$name image reference가 없습니다"
  actual_digest="$(docker image inspect "$reference" --format '{{.Id}}' 2>/dev/null)" || fail images "$reference 이미지가 없습니다"
  test "$actual_digest" = "$expected_digest" || test "$actual_digest" = "$expected_config_digest" || fail provenance "$name 이미지 digest가 manifest와 다릅니다"
  actual_version="$(docker image inspect "$reference" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')"
  actual_revision="$(docker image inspect "$reference" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
  test "$actual_version" = "$version" || fail provenance "$name 이미지 제품 버전이 manifest와 다릅니다"
  test "$actual_revision" = "$revision" || fail provenance "$name 이미지 Git revision이 manifest와 다릅니다"
}

preflight_runtime() {
  verify_files
  load_images
  verify_image api; verify_image web
  "${COMPOSE[@]}" run --rm --no-deps api node node_modules/@oss-scp/plugin-config/dist/cli.js >/dev/null || fail config '외부 플러그인·Connection 설정 검증에 실패했습니다'
}

run_migration() {
  mkdir -p "$STATE_DIR"; : >"$STATE_DIR/migration-started"
  "${COMPOSE[@]}" run --rm api node node_modules/@oss-scp/platform-db/dist/migrate-cli.js || fail migration 'DB migration에 실패했습니다'
  : >"$STATE_DIR/migration-completed"
}

start_services() { "${COMPOSE[@]}" up -d --force-recreate --wait --wait-timeout 120 api web || fail recreate 'API·웹 기동에 실패했습니다'; }

published_address() {
  local service="$1" port="$2" address
  address="$("${COMPOSE[@]}" port "$service" "$port" | head -n 1)" || fail health "$service 공개 포트를 확인하지 못했습니다"
  test -n "$address" || fail health "$service 공개 포트가 없습니다"
  case "$address" in
    0.0.0.0:*|\[::\]:*|:::*) printf '127.0.0.1:%s' "${address##*:}" ;;
    *) printf '%s' "$address" ;;
  esac
}

verify_running() {
  local version revision service container actual_version actual_revision api_address web_address
  version="$(manifest_value productVersion)"; revision="$(manifest_value gitRevision)"
  for service in api web; do
    container="$("${COMPOSE[@]}" ps -q "$service")"; test -n "$container" || fail health "$service 컨테이너가 실행 중이 아닙니다"
    actual_version="$(docker inspect "$container" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')"
    actual_revision="$(docker inspect "$container" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
    test "$actual_version" = "$version" || fail version "$service 적용 버전이 $version이 아닙니다"
    test "$actual_revision" = "$revision" || fail version "$service 적용 revision이 manifest와 다릅니다"
  done
  api_address="$(published_address api 3000)"; web_address="$(published_address web 8080)"
  curl --fail --silent --show-error --max-time 5 "${OSS_SCP_API_URL:-http://$api_address}/api/v1/health" | grep -q '"status":"ok"' || fail health 'API health 확인에 실패했습니다'
  curl --fail --silent --show-error --max-time 5 "${OSS_SCP_API_URL:-http://$api_address}/api/v1/ready" | grep -q '"status":"ready"' || fail ready 'API ready 확인에 실패했습니다'
  curl --fail --silent --show-error --max-time 5 "${OSS_SCP_WEB_URL:-http://$web_address}/" | grep -q '<div id="root">' || fail web '웹 응답 확인에 실패했습니다'
  printf '적용 확인: version=%s revision=%s\n' "$version" "$revision"
}
