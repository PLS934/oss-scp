import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { assertSelfContainedTransform, loadSelfContainedTransformSnapshot, preflightConfiguration, resolveSecret, validateReadQuery, validateRepository } from '../dist/index.js';
import { createHash } from 'node:crypto';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const temporaryRoots = [];

function temporaryRepository() {
  const root = mkdtempSync(join(tmpdir(), 'oss-scp-plugin-config-'));
  temporaryRoots.push(root);
  cpSync(join(repositoryRoot, 'plugins'), join(root, 'plugins'), { recursive: true });
  cpSync(join(repositoryRoot, 'connections'), join(root, 'connections'), {
    recursive: true,
  });
  return root;
}

function writeJson(root, file, value) {
  const target = join(root, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(root, file) {
  return JSON.parse(readFileSync(join(root, file), 'utf8'));
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true });
});

describe('validateRepository', () => {
  test.each([
    ['apiKey', { type: 'apiKey', header: 'X-API-Key', valueRef: { env: 'SOURCE_API_KEY' } }],
    ['bearer', { type: 'bearer', tokenRef: { env: 'SOURCE_API_TOKEN' } }],
    ['basic', { type: 'basic', usernameRef: { env: 'SOURCE_API_USER' }, passwordRef: { env: 'SOURCE_API_PASSWORD' } }],
  ])('HTTP Connection의 %s 인증 참조를 내부 정의에만 유지한다', (_type, auth) => {
    const root = temporaryRepository();
    const connection = readJson(root, 'connections/mock-api-sample1.json');
    connection.config.auth = auth;
    writeJson(root, 'connections/mock-api-sample1.json', connection);

    const result = validateRepository(root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const definition = result.definitions.find(item => item.plugin.id === 'sample1-offset-api');
    expect(definition.connection.auth).toEqual(auth);
    expect(JSON.stringify(result.pluginDetails)).not.toContain('SOURCE_API_');
    expect(JSON.stringify(result.menus)).not.toContain('SOURCE_API_');
  });

  test('HTTP 인증의 실제 값과 잘못된 환경변수 참조를 거부한다', () => {
    const root = temporaryRepository();
    const connection = readJson(root, 'connections/mock-api-sample1.json');
    connection.config.auth = { type: 'bearer', token: 'secret-value' };
    writeJson(root, 'connections/mock-api-sample1.json', connection);
    let result = validateRepository(root);
    expect(result.ok).toBe(false);

    connection.config.auth = { type: 'bearer', tokenRef: { env: 'lowercase-name' } };
    writeJson(root, 'connections/mock-api-sample1.json', connection);
    result = validateRepository(root);
    expect(result.ok).toBe(false);
  });

  test('source별 공개 상세와 안전한 transform 후보를 생성하고 비밀정보는 제외한다', () => {
    const result = validateRepository(repositoryRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pluginDetails).toHaveLength(5);
    const http = result.pluginDetails.find(item => item.configuration.id === 'sample1-offset-api');
    expect(http?.configuration).toMatchObject({
      id: 'sample1-offset-api', version: '0.1.0', enabled: true,
      source: { type: 'http-json', connection: { id: 'mock-api-sample1', baseUrl: 'http://127.0.0.1:3001' }, pagination: { type: 'offset', totalPath: 'total' } },
      data: { types: { asset: { fields: { hostname: { type: 'string', label: '호스트명' } } } } },
      menu: { path: '/assets/servers', list: { columns: expect.any(Array) }, detail: { sections: expect.any(Array) } },
    });
    expect(http?.transformFiles).toEqual({
      pluginRoot: join(repositoryRoot, 'plugins/sample1-offset-api'),
      runtimePath: join(repositoryRoot, 'plugins/sample1-offset-api/dist/transform.js'),
      sourcePath: join(repositoryRoot, 'plugins/sample1-offset-api/transform.ts'),
    });
    expect(result.pluginDetails.find(item => item.configuration.id === 'vulnerabilities-local-csv')?.configuration.source).toMatchObject({ type: 'local-csv', fileName: 'vulnerabilities.csv' });
    expect(result.pluginDetails.find(item => item.configuration.id === 'vulnerabilities-http-csv')?.configuration.source).toMatchObject({ type: 'http-csv', request: { format: 'csv' } });
    const live = result.pluginDetails.find(item => item.configuration.id === 'dependency-track-db')?.configuration;
    expect(live?.source).toMatchObject({ type: 'db-postgres', mode: 'live', persistence: 'none', connection: { host: '127.0.0.1', port: 5433, database: 'dependency_track' }, queries: { list: expect.any(String), detail: expect.any(String) } });
    expect(JSON.stringify(live)).not.toMatch(/password|passwordRef|user|LIVE_|transformPath|pluginRoot/);
  });

  test('명시적 외부 설정 루트에서 전체 registry를 검증한다', () => {
    const root = temporaryRepository();
    const result = validateRepository(root);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.definitions.map(item => item.plugin.id)).toEqual(['sample1-offset-api', 'vulnerabilities-local-csv', 'vulnerabilities-http-csv', 'sample2-single-api', 'dependency-track-db']);
  });

  test('수집 일정 생략·비활성·기본값·사용자 값을 엄격하게 검증한다', () => {
    const root = temporaryRepository();
    const registry = readJson(root, 'plugins/registry.json');
    delete registry.collection;
    writeJson(root, 'plugins/registry.json', registry);
    let result = validateRepository(root);
    expect(result.ok && result.collection.schedule).toEqual({ enabled: false, timezone: 'Asia/Seoul', time: '22:00' });

    registry.collection = { schedule: { enabled: false } };
    writeJson(root, 'plugins/registry.json', registry);
    result = validateRepository(root);
    expect(result.ok && result.collection.schedule).toEqual({ enabled: false, timezone: 'Asia/Seoul', time: '22:00' });

    registry.collection.schedule = { enabled: true };
    writeJson(root, 'plugins/registry.json', registry);
    result = validateRepository(root);
    expect(result.ok && result.collection.schedule).toEqual({ enabled: true, timezone: 'Asia/Seoul', time: '22:00' });

    registry.collection.schedule = { enabled: true, timezone: 'America/New_York', time: '03:15' };
    writeJson(root, 'plugins/registry.json', registry);
    result = validateRepository(root);
    expect(result.ok && result.collection.schedule).toEqual({ enabled: true, timezone: 'America/New_York', time: '03:15' });
  });

  test.each([
    ['알 수 없는 키', { enabled: true, extra: 'secret-value' }, '/collection/schedule/extra'],
    ['잘못된 enabled 타입', { enabled: 'true' }, '/collection/schedule/enabled'],
    ['잘못된 time 타입', { enabled: true, time: 2200 }, '/collection/schedule/time'],
    ['느슨한 시각', { enabled: true, time: '2:00' }, '/collection/schedule/time'],
    ['범위를 벗어난 시각', { enabled: true, time: '24:00' }, '/collection/schedule/time'],
    ['잘못된 timezone', { enabled: true, timezone: 'Not/A_Zone' }, '/collection/schedule/timezone'],
  ])('수집 일정의 %s을 안전한 설정 오류로 거부한다', (_name, schedule, path) => {
    const root = temporaryRepository();
    const registry = readJson(root, 'plugins/registry.json');
    registry.collection = { schedule };
    writeJson(root, 'plugins/registry.json', registry);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(expect.objectContaining({ file: 'plugins/registry.json', path }));
      expect(JSON.stringify(result.errors)).not.toContain('secret-value');
    }
  });

  test('심볼릭 링크를 통한 설정 루트 이탈을 거부한다', () => {
    const root = temporaryRepository();
    const outside = mkdtempSync(join(tmpdir(), 'oss-scp-outside-'));
    temporaryRoots.push(outside);
    writeFileSync(join(outside, 'transform.js'), 'exports.transform = () => ({ records: [] });\n');
    const target = join(root, 'plugins/sample1-offset-api/dist/transform.js');
    rmSync(target);
    symlinkSync(join(outside, 'transform.js'), target);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ path: '/transform', message: expect.stringContaining('configuration root') }));
  });

  test('preflight가 transform export와 모듈 로딩을 검증하고 원본 오류를 숨긴다', async () => {
    const root = temporaryRepository();
    const target = join(root, 'plugins/sample1-offset-api/dist/transform.js');
    writeFileSync(target, 'exports.other = true;\n');
    let result = await preflightConfiguration(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ path: '/transform', message: expect.stringContaining('sample1-offset-api') }));
    writeFileSync(target, 'throw new Error("DO_NOT_PRINT_SECRET");\n');
    result = await preflightConfiguration(root);
    expect(JSON.stringify(result)).not.toContain('DO_NOT_PRINT_SECRET');
  });

  test('preflight가 실행한 정확한 transform 바이트 digest를 runtime definition에 고정한다', async () => {
    const root = temporaryRepository();
    const target = join(root, 'plugins/sample1-offset-api/dist/transform.js');
    const source = 'exports.transform = ({ record }) => record;\n';
    writeFileSync(target, source);
    const result = await preflightConfiguration(root);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.definitions.find(item => item.plugin.id === 'sample1-offset-api')?.plugin.transformDigest)
      .toBe(createHash('sha256').update(source).digest('hex'));
  });

  test('scheduled transform의 filesystem require를 top-level 실행 전에 거부하고 비-scheduled preflight는 유지한다', async () => {
    const root = temporaryRepository();
    const registry = readJson(root, 'plugins/registry.json');
    registry.collection = { schedule: { enabled: true, timezone: 'UTC', time: '00:00' } };
    writeJson(root, 'plugins/registry.json', registry);
    const directory = join(root, 'plugins/sample1-offset-api/dist');
    writeFileSync(join(directory, 'helper.js'), 'globalThis.__ossScpHelperExecuted = true; exports.transform = ({ record }) => record;\n');
    writeFileSync(join(directory, 'transform.js'), 'globalThis.__ossScpMainExecuted = true; exports.transform = require("./helper.js").transform;\n');
    delete globalThis.__ossScpMainExecuted; delete globalThis.__ossScpHelperExecuted;
    const scheduled = await preflightConfiguration(root);
    expect(scheduled.ok).toBe(false);
    expect(globalThis.__ossScpMainExecuted).toBeUndefined();
    expect(globalThis.__ossScpHelperExecuted).toBeUndefined();

    registry.collection.schedule.enabled = false;
    writeJson(root, 'plugins/registry.json', registry);
    const manual = await preflightConfiguration(root);
    expect(manual.ok).toBe(true);
    expect(globalThis.__ossScpMainExecuted).toBe(true);
    expect(globalThis.__ossScpHelperExecuted).toBe(true);
    delete globalThis.__ossScpMainExecuted; delete globalThis.__ossScpHelperExecuted;
  });

  test.each([
    ['globalThis.process', 'globalThis.process.getBuiltinModule("node:fs")'],
    ['process alias', 'const p = process; p.getBuiltinModule("node:fs")'],
    ['computed ambient property', 'const key = "getBuiltinModule"; globalThis.process[key]("node:fs")'],
    ['Reflect.get', 'Reflect.get(globalThis, "process")'],
    ['node:module createRequire', 'const create = require("node:module").createRequire; create(__filename)("node:fs")'],
    ['constructor chain', '({}).constructor.constructor("return process")()'],
    ['destructured constructor chain', 'const { constructor: { constructor: F } } = record; F("return process")()'],
    ['eval', 'eval("process")'],
    ['Function', 'Function("return process")()'],
    ['ambient this', 'this.process'],
    ['module loader', 'module.require("node:fs")'],
    ['dynamic import', 'import("node:fs")'],
  ])('scheduled transform allowlist가 %s 우회를 실행 전에 거부한다', (_name, escape) => {
    const runtimeTrap = 'const executed = Number({ valueOf: () => ({ value: true }).missing() });';
    const source = `${runtimeTrap}\nexports.transform = ({ record }) => { ${escape}; return record; };\n`;
    expect(() => loadSelfContainedTransformSnapshot(Buffer.from(source), '/snapshot/transform.js'))
      .toThrowError(/^scheduled transform/);
  });

  test('repository의 배포 transform은 scheduled 순수 mapping allowlist를 충족한다', () => {
    for (const directory of ['dependency-track-db', 'sample1-offset-api', 'sample2-single-api', 'vulnerabilities-http-csv', 'vulnerabilities-local-csv']) {
      expect(() => assertSelfContainedTransform(readFileSync(join(repositoryRoot, 'plugins', directory, 'dist/transform.js')))).not.toThrow();
    }
  });

  test.each([
    ['sibling scope', 'const selected = ({ record }) => fetch(record.url); const sibling = () => { const fetch = value => value; return fetch("safe"); }; exports.transform = selected;'],
    ['nested sibling scope', 'const selected = ({ record }) => { const unsafe = () => console.log(record); const sibling = () => { const console = { log: value => value }; return console.log(record); }; return unsafe(); }; exports.transform = selected;'],
  ])('scheduled lexical allowlist가 %s의 binding을 ambient 참조에 평탄화하지 않는다', (_name, body) => {
    const runtimeTrap = 'const executed = Number({ valueOf: () => ({ value: true }).missing() });';
    expect(() => loadSelfContainedTransformSnapshot(Buffer.from(`${runtimeTrap}\n${body}\n`), '/snapshot/transform.js'))
      .toThrowError(/^scheduled transform/);
  });

  test('scheduled 순수 mapping은 async arrow와 await를 지원한다', async () => {
    const source = 'exports.transform = async ({ record }) => { const mapped = await record; return { ...mapped, async: true }; };\n';
    const transform = loadSelfContainedTransformSnapshot(Buffer.from(source), '/snapshot/transform.js');
    await expect(transform({ record: { id: 'one' } })).resolves.toEqual({ id: 'one', async: true });
  });
  test('sample1과 sample2 설정을 내부 수집 정의로 해석한다', () => {
    const result = validateRepository(repositoryRoot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definitions).toHaveLength(5);
    expect(result.menus.slice(0, 4)).toEqual([
      { title: '취약점', icon: 'shield', group: '보안 관리', order: 10, path: '/vulnerabilities', dataType: 'vulnerability', pluginId: 'vulnerabilities-local-csv', sourceId: 'file:fixtures/csv/vulnerabilities.csv', list: { columns: [{ key: 'cve', label: 'CVE', type: 'string' }, { key: 'name', label: '취약점명', type: 'string' }, { key: 'score', label: '점수', type: 'number' }, { key: 'affected', label: '영향 여부', type: 'boolean' }, { key: 'observedAt', label: '관측 시각', type: 'datetime' }], query: { searchEnabled: true, filters: [{ key: 'score', label: '점수', type: 'number', kind: 'numberRange' }, { key: 'affected', label: '영향 여부', type: 'boolean', kind: 'select', options: [{ value: true, label: '영향 있음' }, { value: false, label: '영향 없음' }] }, { key: 'observedAt', label: '관측 시각', type: 'datetime', kind: 'dateRange' }] }, sorts: [{ key: 'cve', label: 'CVE', type: 'string' }, { key: 'name', label: '취약점명', type: 'string' }, { key: 'score', label: '점수', type: 'number' }, { key: 'affected', label: '영향 여부', type: 'boolean' }, { key: 'observedAt', label: '관측 시각', type: 'datetime' }] }, detail: { sections: [{ title: '취약점 정보', fields: [{ key: 'cve', label: 'CVE', type: 'string' }, { key: 'name', label: '취약점명', type: 'string' }, { key: 'score', label: '점수', type: 'number' }] }, { title: '영향 및 관측', fields: [{ key: 'affected', label: '영향 여부', type: 'boolean' }, { key: 'observedAt', label: '관측 시각', type: 'datetime' }] }] } },
      { title: 'HTTP 취약점', icon: 'shield', group: '보안 관리', order: 20, path: '/vulnerabilities/http', dataType: 'vulnerability', pluginId: 'vulnerabilities-http-csv', sourceId: 'mock-api-vulnerabilities-csv', list: { columns: [{ key: 'cve', label: 'CVE', type: 'string' }, { key: 'name', label: '취약점명', type: 'string' }, { key: 'score', label: '점수', type: 'number' }, { key: 'affected', label: '영향 여부', type: 'boolean' }, { key: 'observedAt', label: '관측 시각', type: 'datetime' }], query: { searchEnabled: true, filters: [{ key: 'score', label: '점수', type: 'number', kind: 'numberRange' }, { key: 'affected', label: '영향 여부', type: 'boolean', kind: 'select', options: [{ value: true, label: '영향 있음' }, { value: false, label: '영향 없음' }] }, { key: 'observedAt', label: '관측 시각', type: 'datetime', kind: 'dateRange' }] }, sorts: [{ key: 'cve', label: 'CVE', type: 'string' }, { key: 'name', label: '취약점명', type: 'string' }, { key: 'score', label: '점수', type: 'number' }, { key: 'affected', label: '영향 여부', type: 'boolean' }, { key: 'observedAt', label: '관측 시각', type: 'datetime' }] }, detail: { sections: [{ title: '식별 정보', fields: [{ key: 'cve', label: 'CVE', type: 'string' }, { key: 'name', label: '취약점명', type: 'string' }] }, { title: 'HTTP 수집 결과', fields: [{ key: 'score', label: '점수', type: 'number' }, { key: 'affected', label: '영향 여부', type: 'boolean' }, { key: 'observedAt', label: '관측 시각', type: 'datetime' }] }] } },
      { title: '서버 자산', icon: 'server', group: '자산 관리', order: 10, path: '/assets/servers', dataType: 'asset', pluginId: 'sample1-offset-api', sourceId: 'mock-api-sample1', list: { columns: [{ key: 'hostname', label: '호스트명', type: 'string' }, { key: 'environment', label: '환경', type: 'string' }, { key: 'ip', label: 'IP 주소', type: 'string' }, { key: 'enabled', label: '활성 상태', type: 'boolean' }], query: { searchEnabled: true, filters: [{ key: 'environment', label: '환경', type: 'string', kind: 'multiSelect', options: [{ value: 'sandbox', label: 'sandbox' }] }, { key: 'enabled', label: '활성 상태', type: 'boolean', kind: 'select', options: [{ value: true, label: '활성' }, { value: false, label: '비활성' }] }] }, sorts: [{ key: 'hostname', label: '호스트명', type: 'string' }, { key: 'environment', label: '환경', type: 'string' }, { key: 'ip', label: 'IP 주소', type: 'string' }, { key: 'enabled', label: '활성 상태', type: 'boolean' }] }, detail: { sections: [{ title: '기본 정보', fields: [{ key: 'hostname', label: '호스트명', type: 'string' }, { key: 'environment', label: '환경', type: 'string' }, { key: 'ip', label: 'IP 주소', type: 'string' }] }, { title: '수집 정보', fields: [{ key: 'integerValue', label: '정수 값', type: 'number' }, { key: 'decimalValue', label: '소수 값', type: 'number' }, { key: 'enabled', label: '활성 상태', type: 'boolean' }] }] } },
      { title: '저장소', icon: 'repository', group: '자산 관리', order: 20, path: '/assets/repositories', dataType: 'repository', pluginId: 'sample2-single-api', sourceId: 'mock-api-sample2', list: { columns: [{ key: 'fullName', label: '저장소 전체 이름', type: 'string' }, { key: 'active', label: '활성 상태', type: 'boolean' }, { key: 'feed', label: '피드', type: 'string' }], query: { searchEnabled: true, filters: [{ key: 'active', label: '활성 상태', type: 'boolean', kind: 'select', options: [{ value: true, label: '활성' }, { value: false, label: '비활성' }] }, { key: 'feed', label: '피드', type: 'string', kind: 'select', options: [{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }] }] }, sorts: [{ key: 'fullName', label: '저장소 전체 이름', type: 'string' }, { key: 'active', label: '활성 상태', type: 'boolean' }, { key: 'feed', label: '피드', type: 'string' }] }, detail: { sections: [{ title: '저장소 정보', fields: [{ key: 'assetKey', label: '자산 키', type: 'string' }, { key: 'fullName', label: '저장소 전체 이름', type: 'string' }, { key: 'active', label: '활성 상태', type: 'boolean' }, { key: 'feed', label: '피드', type: 'string' }] }, { title: '상세 구성', fields: [{ key: 'details', label: '상세 정보', type: 'object' }, { key: 'members', label: '구성원', type: 'array' }] }] } },
    ]);
    expect(result.menus[4]).toEqual(expect.objectContaining({ pluginId: 'dependency-track-db', sourceId: 'dependency-track-postgres', sourceMode: 'live', dataType: 'dependency-item' }));
    expect(result.definitions[4]).toEqual(expect.objectContaining({ mode: 'live', persistence: 'none', connection: expect.objectContaining({ connector: 'postgres' }), source: expect.objectContaining({ type: 'db-postgres' }) }));
    expect(result.definitions[0]).toEqual(expect.objectContaining({
      plugin: expect.objectContaining({
        id: 'sample1-offset-api',
        name: 'Sample 1 Offset API',
        version: '0.1.0',
        transformPath: join(repositoryRoot, 'plugins/sample1-offset-api/dist/transform.js'),
      }),
      connection: { id: 'mock-api-sample1', baseUrl: 'http://127.0.0.1:3001' },
      request: { method: 'GET', path: '/sample1', format: 'json' },
      limits: {
        timeoutMs: 5000,
        maxResponseBytes: 2097152,
        maxRecordBytes: 262144,
      },
      response: { itemsPath: 'rows', totalPath: 'total' },
      pagination: {
        type: 'offset',
        offsetParam: 'offset',
        limitParam: 'limit',
        start: 0,
        limit: 20,
      },
    }));
    expect(result.definitions[1]).toEqual(expect.objectContaining({
      plugin: expect.objectContaining({
        id: 'vulnerabilities-local-csv',
        name: 'Vulnerabilities Local CSV',
        version: '0.1.0',
      }),
      source: {
        transport: 'file',
        format: 'csv',
        path: join(repositoryRoot, 'fixtures/csv/vulnerabilities.csv'),
      },
      batching: { size: 20 },
      limits: {},
    }));
    expect(result.definitions[3]).toEqual(expect.objectContaining({
      plugin: expect.objectContaining({
        id: 'sample2-single-api',
        name: 'Sample 2 Single API',
        version: '0.1.0',
      }),
      connection: { id: 'mock-api-sample2', baseUrl: 'http://127.0.0.1:3002' },
      request: { method: 'GET', path: '/sample2', format: 'json' },
      limits: {
        timeoutMs: 5000,
        maxResponseBytes: 2097152,
        maxRecordBytes: 262144,
      },
      response: { itemsPath: 'items', metadataPaths: ['test_field6'] },
      pagination: { type: 'single' },
    }));
  });

  test('HTTP CSV 설정을 Connection과 결합한 전용 정의로 해석한다', () => {
    const result = validateRepository(repositoryRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definitions[2]).toEqual(expect.objectContaining({
      plugin: expect.objectContaining({ id: 'vulnerabilities-http-csv' }),
      connection: { id: 'mock-api-vulnerabilities-csv', baseUrl: 'http://127.0.0.1:3001' },
      request: { transport: 'http', method: 'GET', path: '/vulnerabilities.csv', format: 'csv' },
      batching: { size: 20 },
      limits: { timeoutMs: 5000, maxDownloadBytes: 2097152, maxCsvBytes: 2097152, maxRecordSize: 262144 },
    }));
  });

  test.each([
    ['필수 Connection 누락', (source) => delete source.connectionRef, '/connectionRef'],
    ['로컬 속성 혼용', (source) => (source.maxBytes = 100), '/maxBytes'],
    ['JSON 속성 혼용', (source) => (source.itemsPath = 'rows'), '/itemsPath'],
    ['묶음 크기 초과', (source) => (source.batchSize = 1001), '/batchSize'],
    ['레코드가 CSV보다 큼', (source) => (source.limits.maxRecordSize = source.limits.maxCsvBytes + 1), '/limits/maxRecordSize'],
  ])('HTTP CSV의 %s을 거부한다', (_name, mutate, expectedPath) => {
    const root = temporaryRepository();
    const source = readJson(root, 'plugins/vulnerabilities-http-csv/source.json');
    mutate(source);
    writeJson(root, 'plugins/vulnerabilities-http-csv/source.json', source);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.path === expectedPath)).toBe(true);
  });

  test('HTTP CSV의 미등록 Connection을 요청 전에 거부한다', () => {
    const root = temporaryRepository();
    const source = readJson(root, 'plugins/vulnerabilities-http-csv/source.json');
    source.connectionRef = 'missing-http-csv';
    writeJson(root, 'plugins/vulnerabilities-http-csv/source.json', source);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({
      path: '/connectionRef', message: 'unknown connection id: missing-http-csv',
    }));
  });

  test.each([
    ['잘못된 활성화 값', (plugin) => (plugin.enabled = 'false'), '/enabled'],
    ['잘못된 설명', (plugin) => (plugin.description = {}), '/description'],
    ['지원하지 않는 아이콘', (plugin) => (plugin.menu.icon = 'unknown'), '/menu/icon'],
    ['상대 메뉴 경로', (plugin) => (plugin.menu.path = 'assets'), '/menu/path'],
  ])('플러그인의 %s을 거부한다', (_name, mutate, expectedPath) => {
    const root = temporaryRepository();
    const plugin = readJson(root, 'plugins/sample1-offset-api/plugin.json');
    mutate(plugin);
    writeJson(root, 'plugins/sample1-offset-api/plugin.json', plugin);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some(error => error.path === expectedPath)).toBe(true);
  });

  test.each([
    ['필드 label 누락', (plugin) => delete plugin.data.types.asset.fields.hostname.label, '/data/types/asset/fields/hostname/label'],
    ['목록 views 누락', (plugin) => delete plugin.data.types.asset.views, '/data/types/asset/views'],
    ['빈 목록 columns', (plugin) => (plugin.data.types.asset.views.list.columns = []), '/data/types/asset/views/list/columns'],
    ['중복 목록 column', (plugin) => (plugin.data.types.asset.views.list.columns = ['hostname', 'hostname']), '/data/types/asset/views/list/columns'],
    ['상세 views 누락', (plugin) => delete plugin.data.types.asset.views.detail, '/data/types/asset/views/detail'],
    ['빈 상세 sections', (plugin) => (plugin.data.types.asset.views.detail.sections = []), '/data/types/asset/views/detail/sections'],
    ['빈 section fields', (plugin) => (plugin.data.types.asset.views.detail.sections[0].fields = []), '/data/types/asset/views/detail/sections/0/fields'],
    ['빈 section 제목', (plugin) => (plugin.data.types.asset.views.detail.sections[0].title = ''), '/data/types/asset/views/detail/sections/0/title'],
    ['중복 section 내부 field', (plugin) => (plugin.data.types.asset.views.detail.sections[0].fields = ['hostname', 'hostname']), '/data/types/asset/views/detail/sections/0/fields'],
    ['상세 section 추가 속성', (plugin) => (plugin.data.types.asset.views.detail.sections[0].layout = 'grid'), '/data/types/asset/views/detail/sections/0/layout'],
  ])('플러그인의 %s을 schema 오류로 거부한다', (_name, mutate, expectedPath) => {
    const root = temporaryRepository();
    const plugin = readJson(root, 'plugins/sample1-offset-api/plugin.json');
    mutate(plugin);
    writeJson(root, 'plugins/sample1-offset-api/plugin.json', plugin);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some(error => error.path === expectedPath)).toBe(true);
  });

  test('재귀 필드의 label 누락을 거부한다', () => {
    const root = temporaryRepository();
    const plugin = readJson(root, 'plugins/sample2-single-api/plugin.json');
    delete plugin.data.types.repository.fields.details.fields.observedAt.label;
    writeJson(root, 'plugins/sample2-single-api/plugin.json', plugin);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some(error => error.path === '/data/types/repository/fields/details/fields/observedAt/label')).toBe(true);
  });

  test('목록의 누락 필드와 object·array 참조를 정확한 위치에서 거부한다', () => {
    const root = temporaryRepository();
    const plugin = readJson(root, 'plugins/sample2-single-api/plugin.json');
    plugin.data.types.repository.views.list.columns = ['missing', 'details', 'members'];
    writeJson(root, 'plugins/sample2-single-api/plugin.json', plugin);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/data/types/repository/views/list/columns/0', message: 'unknown field: missing' }),
      expect.objectContaining({ path: '/data/types/repository/views/list/columns/1', message: 'list column must reference a scalar field: details' }),
      expect.objectContaining({ path: '/data/types/repository/views/list/columns/2', message: 'list column must reference a scalar field: members' }),
    ]));
  });

  test('목록 산출물은 선택된 scalar 메타데이터만 포함한다', () => {
    const result = validateRepository(repositoryRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const menu = result.menus.find(item => item.pluginId === 'sample2-single-api');
    expect(menu?.list.columns).toEqual([
      { key: 'fullName', label: '저장소 전체 이름', type: 'string' },
      { key: 'active', label: '활성 상태', type: 'boolean' },
      { key: 'feed', label: '피드', type: 'string' },
    ]);
    expect(menu?.list.query.searchEnabled).toBe(true);
    expect(menu?.list.query.filters.map(filter => filter.key)).toEqual(['active', 'feed']);
    expect(JSON.stringify(menu?.list)).not.toMatch(/assetKey|details|members|baseUrl|connection|transformPath/);
  });

  test('상세의 누락 필드와 섹션 간 중복을 정확한 두 번째 위치에서 거부한다', () => {
    const root = temporaryRepository();
    const plugin = readJson(root, 'plugins/sample2-single-api/plugin.json');
    plugin.data.types.repository.views.detail.sections = [
      { title: '중복', fields: ['fullName', 'missing'] },
      { title: '중복', fields: ['details', 'fullName'] },
    ];
    writeJson(root, 'plugins/sample2-single-api/plugin.json', plugin);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/data/types/repository/views/detail/sections/0/fields/1', message: 'unknown field: missing' }),
      expect.objectContaining({ path: '/data/types/repository/views/detail/sections/1/title', message: 'duplicate detail section title: 중복' }),
      expect.objectContaining({ path: '/data/types/repository/views/detail/sections/1/fields/1', message: 'duplicate detail field: fullName' }),
    ]));
  });

  test('상세 산출물은 선택된 scalar·object·array의 최소 메타데이터만 포함한다', () => {
    const result = validateRepository(repositoryRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const menu = result.menus.find(item => item.pluginId === 'sample2-single-api');
    expect(menu?.detail).toEqual({ sections: [
      { title: '저장소 정보', fields: [
        { key: 'assetKey', label: '자산 키', type: 'string' },
        { key: 'fullName', label: '저장소 전체 이름', type: 'string' },
        { key: 'active', label: '활성 상태', type: 'boolean' },
        { key: 'feed', label: '피드', type: 'string' },
      ] },
      { title: '상세 구성', fields: [
        { key: 'details', label: '상세 정보', type: 'object' },
        { key: 'members', label: '구성원', type: 'array' },
      ] },
    ] });
    expect(JSON.stringify(menu?.detail)).not.toMatch(/observedAt|login|baseUrl|connection|transformPath/);
  });

  test('메뉴 데이터 종류와 registry 전체 중복 경로를 거부한다', () => {
    const root = temporaryRepository();
    const first = readJson(root, 'plugins/sample1-offset-api/plugin.json');
    first.menu.dataType = 'missing';
    writeJson(root, 'plugins/sample1-offset-api/plugin.json', first);
    const second = readJson(root, 'plugins/sample2-single-api/plugin.json');
    second.menu.path = '/vulnerabilities';
    writeJson(root, 'plugins/sample2-single-api/plugin.json', second);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'plugins/sample1-offset-api/plugin.json', path: '/menu/dataType', message: expect.stringContaining('missing') }),
      expect.objectContaining({ file: 'plugins/sample2-single-api/plugin.json', path: '/menu/path', message: expect.stringContaining('duplicate') }),
    ]));
  });

  test('registry 순서와 무관하게 메뉴를 결정적으로 정렬한다', () => {
    const root = temporaryRepository();
    writeJson(root, 'plugins/registry.json', { plugins: ['./sample2-single-api', './sample1-offset-api', './vulnerabilities-http-csv', './vulnerabilities-local-csv'] });
    const result = validateRepository(root);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.menus.map(menu => menu.path)).toEqual(['/vulnerabilities', '/vulnerabilities/http', '/assets/servers', '/assets/repositories']);
  });

  test('로컬 CSV source의 옵션과 저장소 내부 경로를 해석한다', () => {
    const root = temporaryRepository();
    const source = readJson(root, 'plugins/vulnerabilities-local-csv/source.json');
    Object.assign(source, { path: 'data/other.csv', batchSize: 17, maxBytes: 99, maxRecordSize: 33 });
    writeJson(root, 'plugins/vulnerabilities-local-csv/source.json', source);

    const result = validateRepository(root);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definitions[1]).toEqual(expect.objectContaining({
      source: { transport: 'file', format: 'csv', path: join(root, 'data/other.csv') },
      batching: { size: 17 },
      limits: { maxBytes: 99, maxRecordSize: 33 },
    }));
  });

  test.each([
    ['Connection 혼용', (source) => (source.connectionRef = 'mock-api'), '/connectionRef'],
    ['HTTP 속성 혼용', (source) => (source.method = 'GET'), '/method'],
    ['묶음 크기 초과', (source) => (source.batchSize = 1001), '/batchSize'],
    ['파일 한도 오류', (source) => (source.maxBytes = 0), '/maxBytes'],
  ])('로컬 CSV의 %s을 거부한다', (_name, mutate, expectedPath) => {
    const root = temporaryRepository();
    const source = readJson(root, 'plugins/vulnerabilities-local-csv/source.json');
    mutate(source);
    writeJson(root, 'plugins/vulnerabilities-local-csv/source.json', source);

    const result = validateRepository(root);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.path === expectedPath)).toBe(true);
  });

  test.each(['../outside.csv', '/tmp/outside.csv'])('설정 루트 밖 CSV 경로를 거부한다: %s', (path) => {
    const root = temporaryRepository();
    const source = readJson(root, 'plugins/vulnerabilities-local-csv/source.json');
    source.path = path;
    writeJson(root, 'plugins/vulnerabilities-local-csv/source.json', source);

    const result = validateRepository(root);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual(expect.objectContaining({ path: '/path' }));
  });

  test('다른 API 값도 코어 변경 없이 해석한다', () => {
    const root = temporaryRepository();
    const plugin = readJson(root, 'plugins/sample1-offset-api/plugin.json');
    plugin.id = 'other-api';
    plugin.name = 'Other API';
    writeJson(root, 'plugins/sample1-offset-api/plugin.json', plugin);
    const source = readJson(root, 'plugins/sample1-offset-api/source.json');
    Object.assign(source, {
      connectionRef: 'other-source',
      path: '/inventory/hosts',
      itemsPath: 'data.items',
      pagination: {
        type: 'offset',
        offsetParam: 'skip',
        limitParam: 'take',
        start: 10,
        limit: 17,
        totalPath: 'meta.count',
      },
    });
    writeJson(root, 'plugins/sample1-offset-api/source.json', source);
    writeJson(root, 'connections/other-source.json', {
      apiVersion: 'oss-scp/connection-v1',
      id: 'other-source',
      connector: 'http',
      config: { baseUrl: 'https://inventory.example.test' },
    });
    writeJson(root, 'connections/registry.json', {
      connections: [
        './mock-api-sample1.json',
        './mock-api-sample2.json',
        './mock-api-vulnerabilities-csv.json',
        './dependency-track-postgres.json',
        './other-source.json',
      ],
    });

    const result = validateRepository(root);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definitions[0]).toMatchObject({
      plugin: { id: 'other-api' },
      connection: {
        id: 'other-source',
        baseUrl: 'https://inventory.example.test',
      },
      request: { path: '/inventory/hosts' },
      limits: source.limits,
      response: { itemsPath: 'data.items', totalPath: 'meta.count' },
      pagination: { offsetParam: 'skip', limitParam: 'take', start: 10, limit: 17 },
    });
  });

  test.each([
    ['한도 누락', (source) => delete source.limits, '/limits'],
    ['timeout 하한 미만', (source) => (source.limits.timeoutMs = 99), '/limits/timeoutMs'],
    ['timeout 상한 초과', (source) => (source.limits.timeoutMs = 300001), '/limits/timeoutMs'],
    ['응답 하한 미만', (source) => (source.limits.maxResponseBytes = 1023), '/limits/maxResponseBytes'],
    ['레코드가 응답보다 큼', (source) => (source.limits.maxRecordBytes = source.limits.maxResponseBytes + 1), '/limits/maxRecordBytes'],
  ])('offset source의 %s을 거부한다', (_name, mutate, expectedPath) => {
    const root = temporaryRepository();
    const source = readJson(root, 'plugins/sample1-offset-api/source.json');
    mutate(source);
    writeJson(root, 'plugins/sample1-offset-api/source.json', source);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.path === expectedPath)).toBe(true);
  });

  test.each([
    { timeoutMs: 100, maxResponseBytes: 1024, maxRecordBytes: 1 },
    { timeoutMs: 300000, maxResponseBytes: 104857600, maxRecordBytes: 104857600 },
  ])('offset source 한도 경계값을 허용한다: %j', (limits) => {
    const root = temporaryRepository();
    const source = readJson(root, 'plugins/sample1-offset-api/source.json');
    source.limits = limits;
    writeJson(root, 'plugins/sample1-offset-api/source.json', source);
    const result = validateRepository(root);
    expect(result.ok).toBe(true);
  });

  test.each([
    ['필수값 누락', (source) => delete source.itemsPath, '/itemsPath'],
    ['추가 속성', (source) => (source.baseUrl = 'https://wrong.example'), '/baseUrl'],
    ['지원하지 않는 방식', (source) => (source.pagination.type = 'cursor'), '/pagination/type'],
    ['지원하지 않는 버전', (source) => (source.apiVersion = 'oss-scp/source-v2'), '/apiVersion'],
  ])('%s을 거부한다', (_name, mutate, expectedPath) => {
    const root = temporaryRepository();
    const source = readJson(root, 'plugins/sample1-offset-api/source.json');
    mutate(source);
    writeJson(root, 'plugins/sample1-offset-api/source.json', source);

    const result = validateRepository(root);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.path === expectedPath)).toBe(true);
  });

  test.each([
    ['필수값 누락', (source) => delete source.itemsPath, '/itemsPath'],
    ['offset 전용 속성', (source) => (source.pagination.limit = 100), '/pagination/limit'],
    ['잘못된 타입', (source) => (source.pagination.type = 1), '/pagination/type'],
    ['지원하지 않는 버전', (source) => (source.apiVersion = 'oss-scp/source-v2'), '/apiVersion'],
    ['잘못된 경로', (source) => (source.path = 'sample2'), '/path'],
  ])('single source의 %s을 거부한다', (_name, mutate, expectedPath) => {
    const root = temporaryRepository();
    const source = readJson(root, 'plugins/sample2-single-api/source.json');
    mutate(source);
    writeJson(root, 'plugins/sample2-single-api/source.json', source);

    const result = validateRepository(root);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.path === expectedPath)).toBe(true);
  });

  test.each([
    ['한도 누락', (source) => delete source.limits, '/limits'],
    ['timeout 하한 미만', (source) => (source.limits.timeoutMs = 99), '/limits/timeoutMs'],
    ['timeout 상한 초과', (source) => (source.limits.timeoutMs = 300001), '/limits/timeoutMs'],
    ['응답 하한 미만', (source) => (source.limits.maxResponseBytes = 1023), '/limits/maxResponseBytes'],
    ['레코드가 응답보다 큼', (source) => (source.limits.maxRecordBytes = source.limits.maxResponseBytes + 1), '/limits/maxRecordBytes'],
  ])('single source의 %s을 거부한다', (_name, mutate, expectedPath) => {
    const root = temporaryRepository();
    const source = readJson(root, 'plugins/sample2-single-api/source.json');
    mutate(source);
    writeJson(root, 'plugins/sample2-single-api/source.json', source);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.path === expectedPath)).toBe(true);
  });

  test.each([
    { timeoutMs: 100, maxResponseBytes: 1024, maxRecordBytes: 1 },
    { timeoutMs: 300000, maxResponseBytes: 104857600, maxRecordBytes: 104857600 },
  ])('single source 한도 경계값을 허용한다: %j', (limits) => {
    const root = temporaryRepository();
    const source = readJson(root, 'plugins/sample2-single-api/source.json');
    source.limits = limits;
    writeJson(root, 'plugins/sample2-single-api/source.json', source);
    const result = validateRepository(root);
    expect(result.ok).toBe(true);
  });

  test('single source의 잘못된 metadata 경로를 거부한다', () => {
    const root = temporaryRepository();
    const source = readJson(root, 'plugins/sample2-single-api/source.json');
    source.metadataPaths = ['../secret'];
    writeJson(root, 'plugins/sample2-single-api/source.json', source);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.path.startsWith('/metadataPaths'))).toBe(true);
  });

  test('다른 single API 값도 코어 변경 없이 해석한다', () => {
    const root = temporaryRepository();
    const plugin = readJson(root, 'plugins/sample2-single-api/plugin.json');
    plugin.id = 'other-single-api';
    plugin.name = 'Other Single API';
    writeJson(root, 'plugins/sample2-single-api/plugin.json', plugin);
    const source = readJson(root, 'plugins/sample2-single-api/source.json');
    Object.assign(source, {
      connectionRef: 'other-source',
      path: '/inventory/all-hosts',
      itemsPath: 'payload.records',
      metadataPaths: ['meta.feed'],
    });
    writeJson(root, 'plugins/sample2-single-api/source.json', source);
    writeJson(root, 'connections/other-source.json', {
      apiVersion: 'oss-scp/connection-v1',
      id: 'other-source',
      connector: 'http',
      config: { baseUrl: 'https://inventory.example.test' },
    });
    writeJson(root, 'connections/registry.json', {
      connections: [
        './mock-api-sample1.json',
        './mock-api-sample2.json',
        './mock-api-vulnerabilities-csv.json',
        './dependency-track-postgres.json',
        './other-source.json',
      ],
    });

    const result = validateRepository(root);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definitions[3]).toEqual(expect.objectContaining({
      plugin: expect.objectContaining({ id: 'other-single-api', name: 'Other Single API', version: '0.1.0' }),
      connection: { id: 'other-source', baseUrl: 'https://inventory.example.test' },
      request: { method: 'GET', path: '/inventory/all-hosts', format: 'json' },
      limits: source.limits,
      response: { itemsPath: 'payload.records', metadataPaths: ['meta.feed'] },
      pagination: { type: 'single' },
    }));
    expect(JSON.stringify(result.definitions[3])).not.toMatch(
      /153|test_field2|test_field3|test_field6/,
    );
  });

  test('sample2 Connection 변경은 sample1 정의에 영향을 주지 않는다', () => {
    const root = temporaryRepository();
    const connection = readJson(root, 'connections/mock-api-sample2.json');
    connection.config.baseUrl = 'http://127.0.0.1:4302';
    writeJson(root, 'connections/mock-api-sample2.json', connection);

    const result = validateRepository(root);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definitions[0].connection).toEqual({
      id: 'mock-api-sample1',
      baseUrl: 'http://127.0.0.1:3001',
    });
    expect(result.definitions[3].connection).toEqual({
      id: 'mock-api-sample2',
      baseUrl: 'http://127.0.0.1:4302',
    });
  });

  test('플러그인 디렉터리 밖 source 참조를 거부한다', () => {
    const root = temporaryRepository();
    const plugin = readJson(root, 'plugins/sample1-offset-api/plugin.json');
    plugin.source = './../outside.json';
    writeJson(root, 'plugins/sample1-offset-api/plugin.json', plugin);
    writeJson(root, 'plugins/outside.json', readJson(root, 'plugins/sample1-offset-api/source.json'));

    const result = validateRepository(root);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: '/source', message: expect.stringContaining('inside') }),
    );
  });

  test.each([
    ['가공 경로 이탈', (plugin) => (plugin.transform = './../outside.js'), '/transform'],
    ['가공 필수값 누락', (plugin) => delete plugin.transform, '/transform'],
    ['데이터 정의 누락', (plugin) => delete plugin.data, '/data'],
    ['잘못된 재귀 필드', (plugin) => (plugin.data.types.asset.fields.details = { type: 'object' }), '/data/types/asset/fields/details'],
  ])('플러그인의 %s을 거부한다', (_name, mutate, expectedPath) => {
    const root = temporaryRepository();
    const plugin = readJson(root, 'plugins/sample1-offset-api/plugin.json');
    mutate(plugin);
    writeJson(root, 'plugins/sample1-offset-api/plugin.json', plugin);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.path.startsWith(expectedPath))).toBe(true);
  });

  test('유일키와 관계의 잘못된 데이터 참조를 거부한다', () => {
    const root = temporaryRepository();
    const plugin = readJson(root, 'plugins/sample1-offset-api/plugin.json');
    plugin.data.types.asset.uniqueKey = 'missing';
    plugin.data.relations = { owns: { from: { types: ['asset'] }, to: { types: ['missing-type'] } } };
    writeJson(root, 'plugins/sample1-offset-api/plugin.json', plugin);
    const result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/data/types/asset/uniqueKey' }),
      expect.objectContaining({ path: '/data/relations/owns/to/types' }),
    ]));
  });

  test('누락된 source 파일과 Connection 참조를 명확히 보고한다', () => {
    const root = temporaryRepository();
    const plugin = readJson(root, 'plugins/sample1-offset-api/plugin.json');
    plugin.source = './missing.json';
    writeJson(root, 'plugins/sample1-offset-api/plugin.json', plugin);

    let result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({ file: 'plugins/sample1-offset-api/missing.json' }),
      );
    }

    plugin.source = './source.json';
    writeJson(root, 'plugins/sample1-offset-api/plugin.json', plugin);
    const source = readJson(root, 'plugins/sample1-offset-api/source.json');
    source.connectionRef = 'missing-connection';
    writeJson(root, 'plugins/sample1-offset-api/source.json', source);
    result = validateRepository(root);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: '/connectionRef',
          message: 'unknown connection id: missing-connection',
        }),
      );
    }
  });

  test('중복 ID와 여러 파일의 오류를 함께 보고하며 설정값을 노출하지 않는다', () => {
    const root = temporaryRepository();
    const connection = readJson(root, 'connections/mock-api-sample1.json');
    connection.password = 'DO_NOT_PRINT_THIS_SECRET';
    writeJson(root, 'connections/mock-api-sample1.json', connection);
    writeJson(root, 'connections/duplicate.json', {
      apiVersion: 'oss-scp/connection-v1',
      id: 'mock-api-sample1',
      connector: 'http',
      config: { baseUrl: 'https://duplicate.example.test' },
    });
    writeJson(root, 'connections/registry.json', {
      connections: [
        './mock-api-sample1.json',
        './mock-api-sample2.json',
        './mock-api-vulnerabilities-csv.json',
        './duplicate.json',
      ],
    });
    const source = readJson(root, 'plugins/sample1-offset-api/source.json');
    source.unknown = 'ANOTHER_PRIVATE_VALUE';
    writeJson(root, 'plugins/sample1-offset-api/source.json', source);

    const result = validateRepository(root);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(new Set(result.errors.map((error) => error.file)).size).toBeGreaterThan(1);
    const output = JSON.stringify(result.errors);
    expect(output).not.toContain('DO_NOT_PRINT_THIS_SECRET');
    expect(output).not.toContain('ANOTHER_PRIVATE_VALUE');
  });

  test('중복 Connection ID를 거부한다', () => {
    const root = temporaryRepository();
    writeJson(root, 'connections/duplicate.json', {
      apiVersion: 'oss-scp/connection-v1',
      id: 'mock-api-sample1',
      connector: 'http',
      config: { baseUrl: 'https://duplicate.example.test' },
    });
    writeJson(root, 'connections/registry.json', {
      connections: [
        './mock-api-sample1.json',
        './mock-api-sample2.json',
        './mock-api-vulnerabilities-csv.json',
        './duplicate.json',
      ],
    });

    const result = validateRepository(root);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        file: 'connections/duplicate.json',
        path: '/id',
        message: 'duplicate connection id: mock-api-sample1',
      }),
    );
  });
});

describe('PostgreSQL 라이브 source 안전 계약', () => {
  test.each([
    'SELECT * FROM one UNION ALL SELECT * FROM two',
    'WITH rows AS (SELECT * FROM one) SELECT * FROM rows',
  ])('읽기 전용 단일 문장을 허용한다: %s', sql => expect(() => validateReadQuery(sql)).not.toThrow());

  test.each([
    'SELECT 1; SELECT 2',
    'WITH changed AS (DELETE FROM one RETURNING *) SELECT * FROM changed',
    'SELECT * INTO copied FROM one',
    'SELECT * FROM one FOR UPDATE',
    'DELETE FROM one',
  ])('변경·다중·잠금 문장을 거부한다: %s', sql => expect(() => validateReadQuery(sql)).toThrow());

  test('목록 parameter를 거부하고 상세는 $1 하나만 허용한다', () => {
    expect(() => validateReadQuery('SELECT * FROM one WHERE id = $1')).toThrow();
    expect(() => validateReadQuery('SELECT * FROM one WHERE id = $1', true)).not.toThrow();
    expect(() => validateReadQuery('SELECT * FROM one WHERE id = $2', true)).toThrow();
  });

  test('환경변수와 secret root 파일만 읽고 비밀 값을 오류에 포함하지 않는다', () => {
    expect(resolveSecret({ env: 'LIVE_SECRET' }, { env: { LIVE_SECRET: 'private-value' } })).toBe('private-value');
    const root = mkdtempSync(join(tmpdir(), 'oss-scp-secret-')); temporaryRoots.push(root);
    writeFileSync(join(root, 'password'), 'file-secret\n');
    expect(resolveSecret({ file: 'password' }, { secretRoot: root })).toBe('file-secret');
    expect(() => resolveSecret({ file: '../password' }, { secretRoot: root })).toThrowError(expect.not.stringContaining('file-secret'));
    expect(() => resolveSecret({ env: 'MISSING' }, { env: {} })).toThrowError(expect.not.stringContaining('private-value'));
  });

  test('외부 source SQL 변경을 다시 읽어 이미지 빌드 없이 새 정의를 만든다', () => {
    const root = temporaryRepository();
    const before = validateRepository(root); expect(before.ok).toBe(true);
    const file = 'plugins/dependency-track-db/source.json';
    const source = readJson(root, file); source.listQuery = `${source.listQuery} ORDER BY external_key`;
    writeJson(root, file, source);
    const after = validateRepository(root); expect(after.ok).toBe(true);
    if (before.ok && after.ok) expect(after.definitions.find(item => item.plugin.id === 'dependency-track-db').source.listQuery).not.toBe(before.definitions.find(item => item.plugin.id === 'dependency-track-db').source.listQuery);
  });
});


test('등록 요약은 실제 출처와 기본 활성화를 제공하며 원천 설정을 노출하지 않는다', () => {
  const result = validateRepository(temporaryRepository());
  expect(result.ok).toBe(true);
  expect(result.plugins.map(plugin => [plugin.id, plugin.sourceType, plugin.enabled])).toEqual([
    ['sample1-offset-api', 'http-json', true],
    ['vulnerabilities-local-csv', 'local-csv', true],
    ['vulnerabilities-http-csv', 'http-csv', true],
    ['sample2-single-api', 'http-json', true],
    ['dependency-track-db', 'db-postgres', true],
  ]);
  expect(result.plugins[0].endpoint).toEqual({ url: 'http://127.0.0.1:3001/sample1', method: 'GET' });
  expect(result.plugins[1].fileName).toBe('vulnerabilities.csv');
  expect(result.plugins[1].endpoint).toBeUndefined();
  expect(result.plugins[2].endpoint).toEqual({ url: 'http://127.0.0.1:3001/vulnerabilities.csv', method: 'GET' });
  expect(result.plugins[2].fileName).toBe('vulnerabilities.csv');
  expect(JSON.stringify(result.plugins)).not.toMatch(/transformPath|fixtures\/csv|connectionRef/);
});

test('비활성 플러그인은 등록 목록에 남고 수집 정의·메뉴·transform 로딩에서 제외한다', async () => {
  const root = temporaryRepository();
  const file = 'plugins/sample1-offset-api/plugin.json';
  const plugin = readJson(root, file);
  plugin.enabled = false;
  plugin.description = '서버 자산 제공';
  writeJson(root, file, plugin);
  writeFileSync(join(root, 'plugins/sample1-offset-api/dist/transform.js'), "throw new Error('disabled module must not run');");
  const result = await preflightConfiguration(root);
  expect(result.ok).toBe(true);
  expect(result.plugins.find(item => item.id === plugin.id)).toEqual({ id: plugin.id, name: plugin.name, description: plugin.description, enabled: false, sourceType: 'http-json', endpoint: { url: 'http://127.0.0.1:3001/sample1', method: 'GET' } });
  expect(result.definitions.some(item => item.plugin.id === plugin.id)).toBe(false);
  expect(result.menus.some(item => item.pluginId === plugin.id)).toBe(false);
});

test('메뉴 없는 플러그인은 수집 정의와 등록 목록만 제공한다', () => {
  const root = temporaryRepository();
  const file = 'plugins/sample1-offset-api/plugin.json';
  const plugin = readJson(root, file);
  delete plugin.menu;
  writeJson(root, file, plugin);
  const result = validateRepository(root);
  expect(result.ok).toBe(true);
  expect(result.plugins.some(item => item.id === plugin.id)).toBe(true);
  expect(result.definitions.some(item => item.plugin.id === plugin.id)).toBe(true);
  expect(result.menus.some(item => item.pluginId === plugin.id)).toBe(false);
});


test('공개 endpoint에서 URL 인증정보를 제거한다', () => {
  const root = temporaryRepository();
  const file = 'connections/mock-api-sample1.json';
  const connection = readJson(root, file);
  connection.config.baseUrl = 'https://user:do-not-expose@example.test:8443';
  writeJson(root, file, connection);
  const result = validateRepository(root);
  expect(result.ok).toBe(true);
  expect(result.plugins[0].endpoint).toEqual({ url: 'https://example.test:8443/sample1', method: 'GET' });
  expect(JSON.stringify(result.plugins)).not.toContain('do-not-expose');
});
