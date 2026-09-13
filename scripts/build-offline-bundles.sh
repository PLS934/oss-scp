#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

version="${1:-}"; revision="${2:-}"; release_output="${3:-}"; output="${4:-}"
if test -z "$version" || test -z "$revision" || test -z "$release_output" || test -z "$output"; then
  echo "사용법: $0 <version> <40자리-git-revision> <release-output> <output-directory>" >&2; exit 2
fi
node scripts/release-metadata.mjs "v${version}" "$revision" >/dev/null
test -d "$release_output" || { echo "릴리스 입력 경로가 없습니다: $release_output" >&2; exit 1; }
test ! -e "$output" || { echo "출력 경로가 이미 존재합니다: $output" >&2; exit 1; }
for name in "oss-scp-api-${version}.tar.gz" "oss-scp-web-${version}.tar.gz"; do test -f "$release_output/$name" || { echo "릴리스 입력 파일이 없습니다: $name" >&2; exit 1; }; done

temporary="$(mktemp -d "${TMPDIR:-/tmp}/oss-scp-bundles.XXXXXX")"
trap 'rm -rf -- "$temporary"' EXIT
gzip -dc "$release_output/oss-scp-api-${version}.tar.gz" | docker load >/dev/null
gzip -dc "$release_output/oss-scp-web-${version}.tar.gz" | docker load >/dev/null
api="oss-scp-api:${version}"; web="oss-scp-web:${version}"
node scripts/verify-release-image.mjs "$api" "$version" "$revision"
node scripts/verify-release-image.mjs "$web" "$version" "$revision"
postgres="$(tr -d '[:space:]' < release/bundle/postgres-image.txt)"
docker image inspect "$postgres" >/dev/null 2>&1 || docker pull "$postgres" >/dev/null
postgres_tag="postgres:17.6-bookworm"
docker tag "$postgres" "$postgres_tag"

staged_output="$temporary/output"
mkdir "$staged_output"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
for variant in existing-db postgresql; do
  suffix=""; test "$variant" = postgresql && suffix="-postgresql"
  root="oss-scp-bundle-${version}${suffix}"; stage="$temporary/$root"; mkdir "$stage"
  cp "release/bundle/compose-${variant}.yaml" "$stage/compose.yaml"
  sed "s/^OSS_SCP_VERSION=.*/OSS_SCP_VERSION=${version}/" "release/bundle/env-${variant}.example" >"$stage/env.example"
  cp release/bundle/{README.md,lib.sh,install.sh,update.sh,rollback.sh,verify.sh} "$stage/"
  chmod +x "$stage"/*.sh
  images=("$api" "$web"); test "$variant" = postgresql && images+=("$postgres_tag")
  docker save "${images[@]}" -o "$stage/images.tar"
  BUNDLE_VERSION="$version" BUNDLE_REVISION="$revision" BUNDLE_VARIANT="$variant" BUNDLE_CREATED_AT="$created_at" BUNDLE_API="$api" BUNDLE_WEB="$web" BUNDLE_POSTGRES="$postgres_tag" BUNDLE_IMAGES_TAR="$stage/images.tar" node --input-type=module >"$stage/manifest.json" <<'NODE'
import { createBundleManifest } from './scripts/bundle-manifest.mjs';
import { execFileSync } from 'node:child_process';
const archive = JSON.parse(execFileSync('tar', ['-xOf', process.env.BUNDLE_IMAGES_TAR, 'index.json'], { encoding: 'utf8' }));
const legacy = JSON.parse(execFileSync('tar', ['-xOf', process.env.BUNDLE_IMAGES_TAR, 'manifest.json'], { encoding: 'utf8' }));
const metadata = reference => {
  const image = archive.manifests.find(entry => entry.annotations?.['io.containerd.image.name']?.endsWith(`/${reference}`));
  const legacyImage = legacy.find(entry => (entry.RepoTags ?? []).includes(reference));
  if (!image || !legacyImage) throw new Error(`images.tar에 ${reference} 이미지가 없습니다`);
  return { digest: image.digest, configDigest: `sha256:${legacyImage.Config.split('/').at(-1)}` };
};
const images = [
  { name: 'api', reference: process.env.BUNDLE_API, ...metadata(process.env.BUNDLE_API) },
  { name: 'web', reference: process.env.BUNDLE_WEB, ...metadata(process.env.BUNDLE_WEB) },
];
if (process.env.BUNDLE_VARIANT === 'postgresql') images.push({ name: 'postgresql', reference: process.env.BUNDLE_POSTGRES, ...metadata(process.env.BUNDLE_POSTGRES) });
const manifest = createBundleManifest({ productVersion: process.env.BUNDLE_VERSION, gitRevision: process.env.BUNDLE_REVISION, variant: process.env.BUNDLE_VARIANT, createdAt: process.env.BUNDLE_CREATED_AT, images });
const flat = { ...manifest };
for (const image of images) { flat[`${image.name}Reference`] = image.reference; flat[`${image.name}Digest`] = image.digest; }
for (const image of images) flat[`${image.name}ConfigDigest`] = image.configDigest;
process.stdout.write(`${JSON.stringify(flat, null, 2)}\n`);
NODE
  (cd "$stage" && find . -type f ! -name SHA256SUMS -print | LC_ALL=C sort | sed 's#^./##' | xargs sha256sum >SHA256SUMS)
  (cd "$stage" && sha256sum --check --strict SHA256SUMS >/dev/null)
  COPYFILE_DISABLE=1 tar -cf - -C "$temporary" "$root" | gzip -n >"$staged_output/${root}.tar.gz"
done
mkdir -p "$(dirname "$output")"
mv "$staged_output" "$output"
printf '오프라인 번들 생성 완료: %s\n' "$output"
