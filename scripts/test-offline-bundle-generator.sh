#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

version="${1:-}"; revision="${2:-}"; release_output="${3:-}"
test -n "$version" && test -n "$revision" && test -d "$release_output" || { echo "사용법: $0 <version> <revision> <release-output>" >&2; exit 2; }
temporary="$(mktemp -d "${TMPDIR:-/tmp}/oss-scp-bundle-failures.XXXXXX")"
trap 'rm -rf -- "$temporary"' EXIT

expect_failure_without_output() {
  local output="$1"; shift
  if "$@" >"$temporary/stdout" 2>"$temporary/stderr"; then echo "실패해야 하는 명령이 성공했습니다: $*" >&2; exit 1; fi
  test ! -e "$output" || { echo "실패 뒤 출력이 남았습니다: $output" >&2; exit 1; }
}

mkdir "$temporary/existing"
printf 'preserve\n' >"$temporary/existing/marker"
if scripts/build-offline-bundles.sh "$version" "$revision" "$release_output" "$temporary/existing" >"$temporary/stdout" 2>"$temporary/stderr"; then
  echo '기존 출력 경로를 거부해야 합니다' >&2; exit 1
fi
test "$(cat "$temporary/existing/marker")" = preserve

mkdir "$temporary/missing"
ln "$release_output/oss-scp-api-${version}.tar.gz" "$temporary/missing/oss-scp-api-${version}.tar.gz"
expect_failure_without_output "$temporary/missing-result" scripts/build-offline-bundles.sh "$version" "$revision" "$temporary/missing" "$temporary/missing-result"
expect_failure_without_output "$temporary/bad-revision" scripts/build-offline-bundles.sh "$version" bad "$release_output" "$temporary/bad-revision"

wrong_version="9.9.9"
mkdir "$temporary/wrong-version"
ln "$release_output/oss-scp-api-${version}.tar.gz" "$temporary/wrong-version/oss-scp-api-${wrong_version}.tar.gz"
ln "$release_output/oss-scp-web-${version}.tar.gz" "$temporary/wrong-version/oss-scp-web-${wrong_version}.tar.gz"
expect_failure_without_output "$temporary/wrong-result" scripts/build-offline-bundles.sh "$wrong_version" "$revision" "$temporary/wrong-version" "$temporary/wrong-result"

mkdir "$temporary/changed"
printf 'changed\n' >"$temporary/changed/oss-scp-api-${version}.tar.gz"
ln "$release_output/oss-scp-web-${version}.tar.gz" "$temporary/changed/oss-scp-web-${version}.tar.gz"
expect_failure_without_output "$temporary/changed-result" scripts/build-offline-bundles.sh "$version" "$revision" "$temporary/changed" "$temporary/changed-result"

echo '번들 생성 실패 시 기존 출력 보존·부분 출력 미생성: 통과'
