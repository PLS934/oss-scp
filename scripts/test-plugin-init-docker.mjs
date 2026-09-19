import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initialize } from '../skills/oss-scp-plugin-init/scripts/init.mjs';

const imageArguments = process.argv.slice(2).filter((argument) => argument !== '--');
if (imageArguments.length !== 1) {
  throw new Error('usage: node scripts/test-plugin-init-docker.mjs <API 이미지:버전>');
}
const [image] = imageArguments;
const temporary = mkdtempSync(join(tmpdir(), 'oss-scp-init-docker-'));
chmodSync(temporary, 0o755);
const validator = fileURLToPath(new URL('../skills/oss-scp-plugin-init/scripts/validate.mjs', import.meta.url));

try {
  for (const source of ['json-single', 'json-offset', 'csv-file', 'csv-http']) {
    const root = initialize({ root: join(temporary, source), id: 'smoke', source });
    assert.equal(statSync(root).mode & 0o777, 0o700);
    const validate = () => spawnSync(process.execPath, [
      validator,
      '--root', root,
      '--image', image,
    ], { encoding: 'utf8', shell: false });

    const valid = validate();
    assert.equal(valid.status, 0, valid.stderr);

    const pluginPath = join(root, 'plugins/smoke/plugin.json');
    const plugin = JSON.parse(readFileSync(pluginPath, 'utf8'));
    plugin.data.types.item.views.list.columns = ['missing'];
    writeFileSync(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`);
    const invalid = validate();
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /columns/);
    console.log(`${source}: 현재 revision 이미지의 실제 검증 성공·손상 설정 실패 확인`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
