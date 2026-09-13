#!/usr/bin/env bash
set -euo pipefail
test "${1:-}" = --backup-confirmed || { echo '사용법: ./update.sh --backup-confirmed' >&2; exit 2; }
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
preflight_runtime
if test "$(manifest_value variant)" = postgresql; then "${COMPOSE[@]}" up -d --wait --wait-timeout 120 postgres || fail database 'PostgreSQL 기동에 실패했습니다'; fi
run_migration; start_services; verify_running
