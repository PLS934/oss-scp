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

const valid = run(repositoryRoot);
if (valid.status !== 0) throw new Error(`valid configuration failed: ${valid.stderr}`);
const output = JSON.parse(valid.stdout);
if (output.definitions?.[0]?.plugin?.id !== 'sample1-offset-api') {
  throw new Error('CLI did not return the sample1 definition');
}
const csvDefinition = output.definitions?.find(
  definition => definition.plugin?.id === 'vulnerabilities-local-csv',
);
if (csvDefinition?.source?.format !== 'csv' || csvDefinition?.batching?.size !== 20) {
  throw new Error('CLI did not return the local CSV definition');
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
