#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
if test -f "$STATE_DIR/migration-started" && test "${1:-}" != --database-restored; then
  fail rollback 'migration이 시작됐습니다. DB 복원 후 ./rollback.sh --database-restored를 실행하세요' 2
fi
preflight_runtime; start_services; verify_running
rm -f "$STATE_DIR/migration-started" "$STATE_DIR/migration-completed"
