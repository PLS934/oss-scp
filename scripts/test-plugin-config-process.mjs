import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(import.meta.dirname, '..');
const cli = join(repositoryRoot, 'packages/plugin-config/dist/cli.js');

function run(root) {
  return spawnSync(process.execPath, [cli, '--root', root], {
    cwd: tmpdir(),
    encoding: 'utf8',
  });
}

function runWithEnv(root) {
  return spawnSync(process.execPath, [cli], { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, OSS_SCP_CONFIG_ROOT: root } });
}

const valid = run(repositoryRoot);
if (valid.status !== 0) throw new Error(`valid configuration failed: ${valid.stderr}`);
const output = JSON.parse(valid.stdout);
if (output.definitions?.[0]?.plugin?.id !== 'sample1-offset-api') {
  throw new Error('CLI did not return the sample1 definition');
}
const sample1Menu = output.menus?.find(menu => menu.pluginId === 'sample1-offset-api');
if (
  JSON.stringify(sample1Menu?.list?.columns) !== JSON.stringify([
    { key: 'hostname', label: '호스트명', type: 'string' },
    { key: 'environment', label: '환경', type: 'string' },
    { key: 'ip', label: 'IP 주소', type: 'string' },
    { key: 'enabled', label: '활성 상태', type: 'boolean' },
  ])
) {
  throw new Error('CLI did not return the validated sample1 list definition');
}
if (/baseUrl|transformPath|connection/.test(JSON.stringify(sample1Menu))) {
  throw new Error('CLI exposed server-only values in the client menu definition');
}
const envValid = runWithEnv(repositoryRoot);
if (envValid.status !== 0) throw new Error(`environment configuration failed: ${envValid.stderr}`);
const missingRoot = spawnSync(process.execPath, [cli], { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, OSS_SCP_CONFIG_ROOT: '' } });
if (missingRoot.status !== 2 || !missingRoot.stderr.includes('usage:')) throw new Error('missing root did not fail with usage');
const csvDefinition = output.definitions?.find(
  definition => definition.plugin?.id === 'vulnerabilities-local-csv',
);
if (csvDefinition?.source?.format !== 'csv' || csvDefinition?.batching?.size !== 20) {
  throw new Error('CLI did not return the local CSV definition');
}
const sample2Definition = output.definitions?.find(
  definition => definition.plugin?.id === 'sample2-single-api',
);
if (
  output.definitions?.[0]?.connection?.id !== 'mock-api-sample1' ||
  output.definitions?.[0]?.limits?.timeoutMs !== 5000 ||
  output.definitions?.[0]?.limits?.maxResponseBytes !== 2097152 ||
  output.definitions?.[0]?.limits?.maxRecordBytes !== 262144 ||
  sample2Definition?.connection?.id !== 'mock-api-sample2'
) {
  throw new Error('CLI did not return independent sample connections');
}

const temporaryRoot = mkdtempSync(join(tmpdir(), 'oss-scp-plugin-cli-'));
try {
  cpSync(join(repositoryRoot, 'plugins'), join(temporaryRoot, 'plugins'), {
    recursive: true,
  });
  cpSync(join(repositoryRoot, 'connections'), join(temporaryRoot, 'connections'), {
    recursive: true,
  });
  const sourceFile = join(temporaryRoot, 'plugins/sample1-offset-api/source.json');
  const source = JSON.parse(readFileSync(sourceFile, 'utf8'));
  source.connectionRef = 'does-not-exist';
  writeFileSync(sourceFile, `${JSON.stringify(source, null, 2)}\n`);

  const invalid = run(temporaryRoot);
  if (invalid.status === 0) throw new Error('invalid configuration exited successfully');
  if (!invalid.stderr.includes('unknown connection id: does-not-exist')) {
    throw new Error(`CLI error was not actionable: ${invalid.stderr}`);
  }
} finally {
  rmSync(temporaryRoot, { recursive: true });
}

console.log('plugin configuration process tests passed');
