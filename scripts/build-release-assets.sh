#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

version="${1:-}"
revision="${2:-}"
output="${3:-}"
if [ -z "$version" ] || [ -z "$revision" ] || [ -z "$output" ]; then
  echo "사용법: $0 <version> <40자리-git-revision> <output-directory>" >&2
  exit 2
fi
node scripts/release-metadata.mjs "v${version}" "$revision" >/dev/null
if [ -e "$output" ]; then
  echo "출력 경로가 이미 존재합니다: $output" >&2
  exit 1
fi

mkdir -p "$output"
api_image="oss-scp-api:${version}"
web_image="oss-scp-web:${version}"
build_args=(--build-arg "PRODUCT_VERSION=${version}" --build-arg "GIT_REVISION=${revision}")

docker build "${build_args[@]}" -f apps/api/Dockerfile -t "$api_image" .
docker build "${build_args[@]}" -f apps/web/Dockerfile -t "$web_image" .

for image in "$api_image" "$web_image"; do
  node scripts/verify-release-image.mjs "$image" "$version" "$revision"
done

docker save "$api_image" | gzip -n >"$output/oss-scp-api-${version}.tar.gz"
docker save "$web_image" | gzip -n >"$output/oss-scp-web-${version}.tar.gz"
cp release/compose.yaml "$output/oss-scp-${version}-compose.yaml"
sed "s/^OSS_SCP_VERSION=.*/OSS_SCP_VERSION=${version}/" release/env.example >"$output/oss-scp-${version}.env.example"

OUTPUT_DIRECTORY="$output" VERSION="$version" node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { createReadStream, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const output = process.env.OUTPUT_DIRECTORY;
const version = process.env.VERSION;
const names = [
  `oss-scp-api-${version}.tar.gz`,
  `oss-scp-web-${version}.tar.gz`,
  `oss-scp-${version}-compose.yaml`,
  `oss-scp-${version}.env.example`,
].sort();
const lines = [];
for (const name of names) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(output, name))) hash.update(chunk);
  lines.push(`${hash.digest('hex')}  ${basename(name)}`);
}
writeFileSync(join(output, 'SHA256SUMS'), `${lines.join('\n')}\n`);
NODE

printf '%s\n' "릴리스 자산 생성 완료: $output"
