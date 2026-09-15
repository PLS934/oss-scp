#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const assets = fileURLToPath(new URL('../assets/', import.meta.url));
const usage = 'node init.mjs --root <새 폴더> --id <플러그인 ID> --source <json-single|json-offset|csv-file|csv-http>';

export function initialize({ root, id, source }) {
  if (!root || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id ?? '')) {
    throw new Error(`새 출력 경로와 소문자 영숫자·하이픈 ID가 필요합니다.\n${usage}`);
  }
  const sources = JSON.parse(readFileSync(join(assets, 'sources.json'), 'utf8'));
  if (!Object.hasOwn(sources, source)) throw new Error(`지원하지 않는 source입니다.\n${usage}`);
  const destination = resolve(root);
  const plugin = JSON.parse(readFileSync(join(assets, 'plugin.json'), 'utf8'));
  plugin.id = id;
  plugin.name = id;
  plugin.menu.title = id;
  plugin.menu.path = `/${id}`;
  const sourceConfig = sources[source];
  const connectionId = `${id}-source`;
  if (source !== 'csv-file') sourceConfig.connectionRef = connectionId;

  // 기존 경로·심볼릭 링크를 허용하지 않는다. mkdir 자체가 존재 여부를 원자적으로 확인한다.
  mkdirSync(destination);
  try {
    const json = (path, value) => {
      const file = join(destination, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    };
    json('plugins/registry.json', { plugins: [`./${id}`] });
    json('connections/registry.json', { connections: source === 'csv-file' ? [] : [`./${connectionId}.json`] });
    json(`plugins/${id}/plugin.json`, plugin);
    json(`plugins/${id}/source.json`, sourceConfig);
    json(`plugins/${id}/package.json`, { private: true, type: 'module' });
    cpSync(join(assets, 'transform.js'), join(destination, 'plugins', id, 'transform.js'));
    mkdirSync(join(destination, 'fixtures'));
    cpSync(join(assets, 'items.csv'), join(destination, 'fixtures/items.csv'));
    cpSync(join(assets, 'items.json'), join(destination, 'fixtures/items.json'));
    if (source !== 'csv-file') {
      json(`connections/${connectionId}.json`, {
        apiVersion: 'oss-scp/connection-v1', id: connectionId, connector: 'http',
        config: { baseUrl: 'http://127.0.0.1:3001' },
      });
    }
    cpSync(join(assets, 'START.md'), join(destination, 'README.md'));
    return destination;
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      root: { type: 'string' }, id: { type: 'string' }, source: { type: 'string' }, help: { type: 'boolean' },
    } });
    if (values.help) console.log(usage);
    else console.log(`생성 완료: ${initialize(values)}\n예제 필드를 수정한 뒤 validate.mjs로 대상 플랫폼 검증을 실행하세요.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
