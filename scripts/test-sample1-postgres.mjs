import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection, createServer } from 'node:net';
import { createApp } from '../apps/mock-api/dist/app.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const databaseType = process.env.SAMPLE1_DB_TYPE === 'mysql' ? 'mysql' : 'postgres';
const password = 'sample1-integration-password';
const container = `oss-scp-sample1-${databaseType}-${process.pid}`;
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'oss-scp-sample1-'));
let mock;
let api;

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function canConnect(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port: Number(port) });
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}
function processRun(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, env: process.env, ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  return {
    child,
    stdout: () => stdout,
    stderr: () => stderr,
    done: new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', code => resolve(code));
    }),
  };
}
async function run(command, args, options = {}, expectedCode = 0) {
  const process = processRun(command, args, options);
  const code = await process.done;
  assert.equal(code, expectedCode, `${command} ${args.join(' ')} exited ${code}\n${process.stdout()}${process.stderr()}`);
  return process.stdout().trim();
}
async function runWhenReady(command, args, options, description, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let output = '';
  while (Date.now() < deadline) {
    const attempt = processRun(command, args, options);
    const code = await attempt.done;
    output = `${attempt.stdout()}${attempt.stderr()}`;
    if (code === 0) return attempt.stdout().trim();
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${description}\n${output}`);
}
async function waitFor(check, description, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch { /* service is starting */ }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${description}`);
}
async function stopProcess(process) {
  if (!process || process.child.exitCode !== null) return;
  process.child.kill('SIGTERM');
  await Promise.race([process.done, delay(3_000)]);
  if (process.child.exitCode === null) process.child.kill('SIGKILL');
}
async function psql(sql) {
  return run('docker', ['exec', container, 'psql', '-U', 'oss_scp_app', '-d', 'oss_scp', '-At', '-c', sql]);
}
async function mysql(sql) {
  return run('docker', ['exec', container, 'mysql', '-uoss_scp_app', `-p${password}`, '-N', '-B', 'oss_scp', '-e', sql]);
}
async function mysqlRoot(sql) {
  return run('docker', ['exec', container, 'mysql', '-uroot', '-proot-integration-password', '-N', '-B', 'oss_scp', '-e', sql]);
}
const databaseSql = sql => databaseType === 'mysql' ? mysql(sql.mysql) : psql(sql.postgres);
async function collect(env, expectedCode = 0, pluginId = 'sample1-offset-api') {
  const output = await run(process.execPath, [path.join(root, 'apps/collector-cli/dist/process.js'), pluginId], {
    cwd: temporaryRoot,
    env,
  }, expectedCode);
  const lines = output.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, `CLI output must contain one JSON line: ${output}`);
  return JSON.parse(lines[0]);
}
async function loadSample() {
  return JSON.parse(await readFile(path.join(temporaryRoot, 'fixtures/sources/sample1.json'), 'utf8'));
}
async function saveSample(sample) {
  await writeFile(path.join(temporaryRoot, 'fixtures/sources/sample1.json'), `${JSON.stringify(sample, null, 2)}\n`);
}
async function restartMock(port) {
  await mock?.close();
  mock = await createApp(path.join(temporaryRoot, 'fixtures'));
  await mock.listen(port, '127.0.0.1');
}

try {
  await Promise.all([
    cp(path.join(root, 'plugins'), path.join(temporaryRoot, 'plugins'), { recursive: true }),
    cp(path.join(root, 'connections'), path.join(temporaryRoot, 'connections'), { recursive: true }),
    cp(path.join(root, 'fixtures'), path.join(temporaryRoot, 'fixtures'), { recursive: true }),
    symlink(path.join(root, 'node_modules'), path.join(temporaryRoot, 'node_modules'), 'dir'),
  ]);
  const mockPort = await freePort();
  const connectionPath = path.join(temporaryRoot, 'connections/mock-api-sample1.json');
  const connection = JSON.parse(await readFile(connectionPath, 'utf8'));
  connection.config.baseUrl = `http://127.0.0.1:${mockPort}`;
  await writeFile(connectionPath, `${JSON.stringify(connection, null, 2)}\n`);
  const csvConnectionPath = path.join(temporaryRoot, 'connections/mock-api-vulnerabilities-csv.json');
  const csvConnection = JSON.parse(await readFile(csvConnectionPath, 'utf8'));
  csvConnection.config.baseUrl = `http://127.0.0.1:${mockPort}`;
  await writeFile(csvConnectionPath, `${JSON.stringify(csvConnection, null, 2)}\n`);

  const databasePort = databaseType === 'mysql' ? '3306' : '5432';
  const dockerArguments = databaseType === 'mysql'
    ? ['-e', 'MYSQL_DATABASE=oss_scp', '-e', 'MYSQL_USER=oss_scp_app', '-e', `MYSQL_PASSWORD=${password}`, '-e', 'MYSQL_ROOT_PASSWORD=root-integration-password', '-p', `127.0.0.1::${databasePort}`, 'mysql:8.4.6']
    : ['-e', 'POSTGRES_DB=oss_scp', '-e', 'POSTGRES_USER=oss_scp_app', '-e', `POSTGRES_PASSWORD=${password}`, '-p', `127.0.0.1::${databasePort}`, 'postgres:17.6-bookworm'];
  await run('docker', ['run', '-d', '--name', container, ...dockerArguments]);
  await waitFor(async () => {
    const check = databaseType === 'mysql'
      ? processRun('docker', ['exec', container, 'mysqladmin', 'ping', '-uoss_scp_app', `-p${password}`, '--silent'])
      : processRun('docker', ['exec', container, 'pg_isready', '-U', 'oss_scp_app', '-d', 'oss_scp']);
    return await check.done === 0;
  }, databaseType);
  const mapping = await run('docker', ['port', container, `${databasePort}/tcp`]);
  const mappedDatabasePort = mapping.match(/:(\d+)$/)?.[1];
  assert.ok(mappedDatabasePort);
  await waitFor(() => canConnect(mappedDatabasePort), `${databaseType} host port`);
  const env = {
    ...process.env,
    OSS_SCP_CONFIG_ROOT: temporaryRoot,
    PLATFORM_DB_TYPE: databaseType, PLATFORM_DB_HOST: '127.0.0.1', PLATFORM_DB_PORT: mappedDatabasePort,
    PLATFORM_DB_NAME: 'oss_scp', PLATFORM_DB_USER: 'oss_scp_app', PLATFORM_DB_PASSWORD: password,
    PLATFORM_DB_TLS_MODE: 'disable',
  };
  await runWhenReady(process.execPath, [path.join(root, 'packages/platform-db/dist/migrate-cli.js')], { env }, `${databaseType} migration connection`);
  await restartMock(mockPort);

  const first = await collect(env);
  assert.deepEqual({ status: first.status, batches: first.batches, processed: first.processed, accepted: first.accepted, rejected: first.rejected },
    { status: 'success', batches: 4, processed: 72, accepted: 72, rejected: 0 });
  assert.equal(await databaseSql({ postgres: "SELECT count(*) FROM platform_records WHERE plugin_id='sample1-offset-api'", mysql: "SELECT count(*) FROM platform_records WHERE plugin_id='sample1-offset-api'" }), '72');
  assert.equal(await databaseSql({ postgres: "SELECT checkpoint::text FROM collection_checkpoints WHERE plugin_id='sample1-offset-api'", mysql: "SELECT checkpoint FROM collection_checkpoints WHERE plugin_id='sample1-offset-api'" }), '72');
  const original = (await databaseSql({ postgres: "SELECT id || '|' || (source_values->>'ip') FROM platform_records WHERE plugin_id='sample1-offset-api' AND external_key='test-host'", mysql: "SELECT id, JSON_UNQUOTE(JSON_EXTRACT(source_values, '$.ip')) FROM platform_records WHERE plugin_id='sample1-offset-api' AND external_key='test-host'" })).split(databaseType === 'mysql' ? '\t' : '|');

  const changed = await loadSample();
  changed.rows[0].ip = '10.20.30.40';
  await saveSample(changed);
  await restartMock(mockPort);
  const rerun = await collect(env);
  assert.deepEqual({ status: rerun.status, batches: rerun.batches, processed: rerun.processed }, { status: 'success', batches: 4, processed: 72 });
  const updated = (await databaseSql({ postgres: "SELECT id || '|' || (source_values->>'ip') FROM platform_records WHERE plugin_id='sample1-offset-api' AND external_key='test-host'", mysql: "SELECT id, JSON_UNQUOTE(JSON_EXTRACT(source_values, '$.ip')) FROM platform_records WHERE plugin_id='sample1-offset-api' AND external_key='test-host'" })).split(databaseType === 'mysql' ? '\t' : '|');
  assert.equal(updated[0], original[0]);
  assert.equal(updated[1], '10.20.30.40');
  assert.equal(await databaseSql({ postgres: "SELECT count(*) FROM platform_records WHERE plugin_id='sample1-offset-api'", mysql: "SELECT count(*) FROM platform_records WHERE plugin_id='sample1-offset-api'" }), '72');

  if (databaseType === 'mysql') await mysqlRoot(`CREATE TRIGGER reject_sample1_batch BEFORE UPDATE ON platform_records FOR EACH ROW SET NEW.id = IF(NEW.external_key='test-host-21', NULL, NEW.id)`);
  else await psql(`CREATE FUNCTION reject_sample1_batch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.external_key='test-host-21' THEN RAISE EXCEPTION 'injected storage failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_sample1_batch BEFORE INSERT OR UPDATE ON platform_records FOR EACH ROW EXECUTE FUNCTION reject_sample1_batch();`);
  const failed = await collect(env, 3);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.errorCode, 'collection_failed');
  assert.equal(await databaseSql({ postgres: "SELECT checkpoint::text FROM collection_checkpoints WHERE plugin_id='sample1-offset-api'", mysql: "SELECT checkpoint FROM collection_checkpoints WHERE plugin_id='sample1-offset-api'" }), '20');
  assert.equal(await databaseSql({ postgres: "SELECT status || '|' || processed_count FROM collection_runs WHERE plugin_id='sample1-offset-api' ORDER BY started_at DESC, id DESC LIMIT 1", mysql: "SELECT CONCAT(status, '|', processed_count) FROM collection_runs WHERE plugin_id='sample1-offset-api' ORDER BY started_at DESC, id DESC LIMIT 1" }), 'failed|20');
  if (databaseType === 'mysql') await mysqlRoot('DROP TRIGGER reject_sample1_batch');
  else await psql('DROP TRIGGER reject_sample1_batch ON platform_records; DROP FUNCTION reject_sample1_batch();');
  const resumed = await collect(env);
  assert.deepEqual({ status: resumed.status, batches: resumed.batches, processed: resumed.processed }, { status: 'success', batches: 3, processed: 52 });
  assert.equal(await databaseSql({ postgres: "SELECT checkpoint::text FROM collection_checkpoints WHERE plugin_id='sample1-offset-api'", mysql: "SELECT checkpoint FROM collection_checkpoints WHERE plugin_id='sample1-offset-api'" }), '72');
  assert.equal(await databaseSql({ postgres: "SELECT count(*) FROM platform_records WHERE plugin_id='sample1-offset-api'", mysql: "SELECT count(*) FROM platform_records WHERE plugin_id='sample1-offset-api'" }), '72');

  const invalid = await loadSample();
  invalid.rows[5]['test-field1'] = 'not-a-number';
  await saveSample(invalid);
  await restartMock(mockPort);
  const partial = await collect(env, 2);
  assert.deepEqual({ status: partial.status, batches: partial.batches, processed: partial.processed, accepted: partial.accepted, rejected: partial.rejected },
    { status: 'partial', batches: 4, processed: 72, accepted: 71, rejected: 1 });
  assert.equal(await databaseSql({
    postgres: `SELECT r.status || '|' || r.processed_count || '|' || r.accepted_count || '|' || r.isolated_count || '|' || c.checkpoint::text FROM collection_runs r JOIN collection_checkpoints c USING (plugin_id, source_id, scope_type, scope_key, config_revision) WHERE r.id='${partial.runId}'`,
    mysql: `SELECT CONCAT(r.status, '|', r.processed_count, '|', r.accepted_count, '|', r.isolated_count, '|', c.checkpoint) FROM collection_runs r JOIN collection_checkpoints c USING (plugin_id, source_id, scope_type, scope_key, config_revision) WHERE r.id='${partial.runId}'`,
  }), 'partial|72|71|1|72');

  const httpCsv = await collect(env, 0, 'vulnerabilities-http-csv');
  assert.deepEqual(
    { status: httpCsv.status, batches: httpCsv.batches, processed: httpCsv.processed, accepted: httpCsv.accepted, rejected: httpCsv.rejected },
    { status: 'success', batches: 3, processed: 53, accepted: 53, rejected: 0 },
  );
  assert.equal(await databaseSql({ postgres: "SELECT count(*) FROM platform_records WHERE plugin_id='vulnerabilities-http-csv'", mysql: "SELECT count(*) FROM platform_records WHERE plugin_id='vulnerabilities-http-csv'" }), '53');
  assert.equal(await databaseSql({ postgres: "SELECT checkpoint::text FROM collection_checkpoints WHERE plugin_id='vulnerabilities-http-csv'", mysql: "SELECT checkpoint FROM collection_checkpoints WHERE plugin_id='vulnerabilities-http-csv'" }), '53');

  if (databaseType === 'mysql') await mysqlRoot(`CREATE TRIGGER reject_http_csv_batch BEFORE UPDATE ON platform_records FOR EACH ROW SET NEW.id = IF(NEW.external_key='cve-21', NULL, NEW.id)`);
  else await psql(`CREATE FUNCTION reject_http_csv_batch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.external_key='cve-21' THEN RAISE EXCEPTION 'injected storage failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_http_csv_batch BEFORE INSERT OR UPDATE ON platform_records FOR EACH ROW EXECUTE FUNCTION reject_http_csv_batch();`);
  const httpCsvFailed = await collect(env, 3, 'vulnerabilities-http-csv');
  assert.equal(httpCsvFailed.status, 'failed');
  assert.equal(httpCsvFailed.errorCode, 'collection_failed');
  assert.equal(await databaseSql({ postgres: "SELECT checkpoint::text FROM collection_checkpoints WHERE plugin_id='vulnerabilities-http-csv'", mysql: "SELECT checkpoint FROM collection_checkpoints WHERE plugin_id='vulnerabilities-http-csv'" }), '20');
  if (databaseType === 'mysql') await mysqlRoot('DROP TRIGGER reject_http_csv_batch');
  else await psql('DROP TRIGGER reject_http_csv_batch ON platform_records; DROP FUNCTION reject_http_csv_batch();');
  const httpCsvResumed = await collect(env, 0, 'vulnerabilities-http-csv');
  assert.deepEqual(
    { status: httpCsvResumed.status, batches: httpCsvResumed.batches, processed: httpCsvResumed.processed },
    { status: 'success', batches: 2, processed: 33 },
  );
  assert.equal(await databaseSql({ postgres: "SELECT checkpoint::text FROM collection_checkpoints WHERE plugin_id='vulnerabilities-http-csv'", mysql: "SELECT checkpoint FROM collection_checkpoints WHERE plugin_id='vulnerabilities-http-csv'" }), '53');
  assert.equal(await databaseSql({ postgres: "SELECT count(*) FROM platform_records WHERE plugin_id='vulnerabilities-http-csv'", mysql: "SELECT count(*) FROM platform_records WHERE plugin_id='vulnerabilities-http-csv'" }), '53');

  const syncApiPort = await freePort();
  api = processRun(process.execPath, [path.join(root, 'apps/api/dist/main.js')], { env: { ...env, HOST: '127.0.0.1', PORT: String(syncApiPort) } });
  await waitFor(async () => (await fetch(`http://127.0.0.1:${syncApiPort}/api/v1/ready`)).ok, 'manual sync API');
  await waitFor(async () => await databaseSql({
    postgres: "SELECT count(*) FROM collection_runs WHERE plugin_id='sample1-offset-api' AND trigger='startup' AND status IN ('success', 'partial', 'failed')",
    mysql: "SELECT count(*) FROM collection_runs WHERE plugin_id='sample1-offset-api' AND `trigger`='startup' AND status IN ('success', 'partial', 'failed')",
  }) === '1', 'startup collection terminal run');
  await waitFor(async () => {
    const state = await (await fetch(`http://127.0.0.1:${syncApiPort}/api/v1/plugins/sample1-offset-api/sync`)).json();
    return state.canExecute === true;
  }, 'startup collection completion');
  const accepted = await fetch(`http://127.0.0.1:${syncApiPort}/api/v1/plugins/sample1-offset-api/sync-runs`, { method: 'POST' });
  assert.equal(accepted.status, 202);
  const syncRequest = await accepted.json();
  let syncTerminal;
  await waitFor(async () => {
    const state = await (await fetch(`http://127.0.0.1:${syncApiPort}/api/v1/sync-runs/${syncRequest.requestId}`)).json();
    syncTerminal = state;
    return ['success', 'partial', 'failed'].includes(state.status);
  }, 'manual sync completion');
  assert.equal(await databaseSql({ postgres: `SELECT count(*) FROM collection_runs WHERE trigger='api' AND request_id='${syncRequest.requestId}'`, mysql: `SELECT count(*) FROM collection_runs WHERE \`trigger\`='api' AND request_id='${syncRequest.requestId}'` }), '1');
  await stopProcess(api); api = undefined;

  await mock.close();
  mock = undefined;
  const registryPath = path.join(temporaryRoot, 'plugins/registry.json');
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  registry.plugins = registry.plugins.filter(pluginPath => pluginPath.includes('sample2-single-api'));
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  const offlineApiPort = await freePort();
  api = processRun(process.execPath, [path.join(root, 'apps/api/dist/main.js')], { env: { ...env, HOST: '127.0.0.1', PORT: String(offlineApiPort) } });
  await waitFor(async () => (await fetch(`http://127.0.0.1:${offlineApiPort}/api/v1/ready`)).ok, 'record API');
  const list = await (await fetch(`http://127.0.0.1:${offlineApiPort}/api/v1/records?pluginId=sample1-offset-api&sourceId=mock-api-sample1&dataType=asset&limit=20`)).json();
  assert.equal(list.items.length, 20);
  assert.equal(list.collection.status, syncTerminal.status);
  assert.equal(list.collection.runId, syncTerminal.runId);
  const detail = await (await fetch(`http://127.0.0.1:${offlineApiPort}/api/v1/records/${list.items[0].id}`)).json();
  assert.equal(detail.id, list.items[0].id);
  assert.equal(detail.pluginId, 'sample1-offset-api');
  console.log(`sample1 및 HTTP CSV ${databaseType} 수집·재실행·실패 재개·partial·원천 독립 조회 검증 통과`);
} finally {
  await mock?.close().catch(() => undefined);
  await stopProcess(api);
  await run('docker', ['rm', '-f', container]).catch(() => undefined);
  await rm(temporaryRoot, { recursive: true, force: true });
}
