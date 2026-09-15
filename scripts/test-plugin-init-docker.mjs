import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initialize } from '../skills/oss-scp-plugin-init/scripts/init.mjs';

const image = process.argv[2];
if (!image) throw new Error('usage: node scripts/test-plugin-init-docker.mjs <API 이미지:버전>');
const temporary = mkdtempSync(join(tmpdir(), 'oss-scp-init-docker-'));
chmodSync(temporary, 0o755);
const validator = fileURLToPath(new URL('../skills/oss-scp-plugin-init/scripts/validate.mjs', import.meta.url));
try {
  for (const source of ['json-single', 'json-offset', 'csv-file', 'csv-http']) {
    const root = initialize({ root: join(temporary, source), id: 'smoke', source });
    const validate = () => spawnSync(process.execPath, [validator, '--root', root, '--image', image], { encoding: 'utf8' });
    const valid = validate();
    assert.equal(valid.status, 0, valid.stderr);
    const path = join(root, 'plugins/smoke/plugin.json');
    const plugin = JSON.parse(readFileSync(path, 'utf8'));
    plugin.data.types.item.views.list.columns = ['missing'];
    writeFileSync(path, JSON.stringify(plugin));
    const invalid = validate();
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /columns/);
    console.log(`${source}: 실제 Docker 검증 성공·실패 확인`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
