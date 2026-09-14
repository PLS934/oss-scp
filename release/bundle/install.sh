#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
verify_files; load_images; verify_image api; verify_image web
if test "$(manifest_value variant)" = postgresql; then "${COMPOSE[@]}" up -d --wait --wait-timeout 120 postgres || fail database 'PostgreSQL 기동에 실패했습니다'; fi
"${COMPOSE[@]}" run --rm --no-deps api node node_modules/@oss-scp/plugin-config/dist/cli.js >/dev/null || fail config '외부 설정 검증에 실패했습니다'
run_migration; start_services; verify_running
