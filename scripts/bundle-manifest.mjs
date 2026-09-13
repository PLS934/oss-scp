const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/;
const revisionPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const variants = new Set(['existing-db', 'postgresql']);

function requiredString(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`manifest ${name}이 유효하지 않습니다`);
  return value;
}

export function validateBundleManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('manifest는 객체여야 합니다');
  if (value.schemaVersion !== 1) throw new Error('지원하지 않는 manifest schemaVersion입니다');
  if (!versionPattern.test(requiredString(value.productVersion, 'productVersion'))) throw new Error('manifest productVersion이 유효하지 않습니다');
  if (!revisionPattern.test(requiredString(value.gitRevision, 'gitRevision'))) throw new Error('manifest gitRevision이 유효하지 않습니다');
  if (!variants.has(value.variant)) throw new Error('manifest variant가 유효하지 않습니다');
  if (Number.isNaN(Date.parse(requiredString(value.createdAt, 'createdAt')))) throw new Error('manifest createdAt이 유효하지 않습니다');
  if (value.platform !== 'linux/amd64') throw new Error('manifest platform이 유효하지 않습니다');
  if (!value.support || value.support.os !== 'Ubuntu 24.04' || !Array.isArray(value.support.databases)) throw new Error('manifest support가 유효하지 않습니다');
  if (!Array.isArray(value.images) || value.images.length < 2) throw new Error('manifest images가 유효하지 않습니다');
  const names = new Set();
  for (const [index, image] of value.images.entries()) {
    if (!image || typeof image !== 'object') throw new Error(`manifest images[${index}]가 유효하지 않습니다`);
    const name = requiredString(image.name, `images[${index}].name`);
    if (names.has(name)) throw new Error(`manifest image 이름이 중복됩니다: ${name}`);
    names.add(name);
    requiredString(image.reference, `images[${index}].reference`);
    if (!digestPattern.test(requiredString(image.digest, `images[${index}].digest`))) throw new Error(`manifest images[${index}].digest가 유효하지 않습니다`);
    if (!digestPattern.test(requiredString(image.configDigest, `images[${index}].configDigest`))) throw new Error(`manifest images[${index}].configDigest가 유효하지 않습니다`);
  }
  if (!names.has('api') || !names.has('web')) throw new Error('manifest에는 api와 web 이미지가 필요합니다');
  if ((value.variant === 'postgresql') !== names.has('postgresql')) throw new Error('manifest variant와 PostgreSQL 이미지가 일치하지 않습니다');
  const expectedDatabases = value.variant === 'postgresql' ? ['postgresql:17.6'] : ['postgresql:17.6', 'mysql:8.4.6'];
  if (JSON.stringify(value.support.databases) !== JSON.stringify(expectedDatabases)) throw new Error('manifest 지원 DB가 variant와 일치하지 않습니다');
  return value;
}

export function createBundleManifest({ productVersion, gitRevision, variant, createdAt, images }) {
  return validateBundleManifest({
    schemaVersion: 1,
    productVersion,
    gitRevision,
    variant,
    createdAt,
    platform: 'linux/amd64',
    support: {
      os: 'Ubuntu 24.04',
      dockerCompose: 'v2',
      databases: variant === 'postgresql' ? ['postgresql:17.6'] : ['postgresql:17.6', 'mysql:8.4.6'],
    },
    images,
  });
}

export function readBundleManifest(text) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('manifest JSON을 읽을 수 없습니다'); }
  return validateBundleManifest(value);
}
