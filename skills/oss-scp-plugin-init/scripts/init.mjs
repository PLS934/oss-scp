#!/usr/bin/env node
import {
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const assets = fileURLToPath(new URL('../assets/', import.meta.url));
const usage = 'node init.mjs --root <새 폴더> --id <플러그인 ID> --source <json-single|json-offset|csv-file|csv-http>';
const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function pathExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function outputPaths(root) {
  const requested = resolve(root);
  const requestedParent = dirname(requested);
  const parent = realpathSync(requestedParent);
  if (!statSync(parent).isDirectory()) throw new Error('출력 부모 경로는 폴더여야 합니다.');
  const name = basename(requested);
  if (!name || requested === requestedParent) throw new Error('새 출력 폴더를 지정해야 합니다.');
  const destination = join(parent, name);
  if (pathExists(destination)) throw new Error('출력 경로가 이미 존재합니다. 기존 파일·폴더·symlink는 덮어쓰지 않습니다.');
  return { destination, parent, name };
}

export function initialize({ root, id, source }) {
  if (!root || !idPattern.test(id ?? '') || id.length > 100) {
    throw new Error(`새 출력 경로와 100자 이하 소문자 영숫자·하이픈 ID가 필요합니다.\n${usage}`);
  }

  const sources = JSON.parse(readFileSync(join(assets, 'sources.json'), 'utf8'));
  if (!Object.hasOwn(sources, source)) throw new Error(`지원하지 않는 source입니다.\n${usage}`);
  const { destination, parent, name } = outputPaths(root);
  const temporary = mkdtempSync(join(parent, `.${name}.tmp-`));
  let moved = false;

  try {
    const plugin = JSON.parse(readFileSync(join(assets, 'plugin.json'), 'utf8'));
    plugin.id = id;
    plugin.name = id;
    plugin.menu.title = id;
    plugin.menu.path = `/${id}`;

    const sourceConfig = sources[source];
    const connectionId = `${id}-source`;
    if (source !== 'csv-file') sourceConfig.connectionRef = connectionId;

    const json = (path, value) => {
      const file = join(temporary, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    };
    const copy = (asset, target) => {
      const file = join(temporary, target);
      mkdirSync(dirname(file), { recursive: true });
      copyFileSync(join(assets, asset), file, constants.COPYFILE_EXCL);
    };

    json('plugins/registry.json', { plugins: [`./${id}`] });
    json('connections/registry.json', {
      connections: source === 'csv-file' ? [] : [`./${connectionId}.json`],
    });
    json(`plugins/${id}/plugin.json`, plugin);
    json(`plugins/${id}/source.json`, sourceConfig);
    json(`plugins/${id}/package.json`, { private: true, type: 'module' });
    copy('transform.js', `plugins/${id}/transform.js`);
    copy('items.csv', 'fixtures/items.csv');
    copy('items.json', 'fixtures/items.json');
    copy('START.md', 'README.md');

    if (source !== 'csv-file') {
      json(`connections/${connectionId}.json`, {
        apiVersion: 'oss-scp/connection-v1',
        id: connectionId,
        connector: 'http',
        config: { baseUrl: 'http://127.0.0.1:3001' },
      });
    }

    if (pathExists(destination)) throw new Error('출력 경로가 생성 중 생겼습니다. 기존 데이터를 보존합니다.');
    renameSync(temporary, destination);
    moved = true;
    return destination;
  } finally {
    if (!moved) rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        root: { type: 'string' },
        id: { type: 'string' },
        source: { type: 'string' },
        help: { type: 'boolean' },
      },
    });
    if (values.help) console.log(usage);
    else console.log(`생성 완료: ${initialize(values)}\n예제 필드를 수정한 뒤 validate.mjs로 대상 플랫폼 검증을 실행하세요.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : '생성에 실패했습니다.');
    process.exitCode = 1;
  }
}
