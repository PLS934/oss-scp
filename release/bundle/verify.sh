#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
verify_files; verify_image api; verify_image web; verify_running
if test "${1:-}" = --query; then
  api_address="$("${COMPOSE[@]}" port api 3000 | tail -n 1)"
  curl --fail --silent --show-error --max-time 5 "${OSS_SCP_API_URL:-http://$api_address}/api/v1/plugin-menus" | grep -q '\[' || fail query '핵심 조회 확인에 실패했습니다'
fi
