import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { preflightConfiguration, validateRepository } from '../dist/index.js';

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
  test('명시적 외부 설정 루트에서 전체 registry를 검증한다', () => {
    const root = temporaryRepository();
    const result = validateRepository(root);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.definitions.map(item => item.plugin.id)).toEqual(['sample1-offset-api', 'vulnerabilities-local-csv', 'vulnerabilities-http-csv', 'sample2-single-api']);
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
  test('sample1과 sample2 설정을 내부 수집 정의로 해석한다', () => {
    const result = validateRepository(repositoryRoot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definitions).toHaveLength(4);
    expect(result.menus).toEqual([
      { title: '취약점', icon: 'shield', group: '보안 관리', order: 10, path: '/vulnerabilities', dataType: 'vulnerability', pluginId: 'vulnerabilities-local-csv', sourceId: 'fixtures/csv/vulnerabilities.csv', list: { columns: [{ key: 'cve', label: 'CVE', type: 'string' }, { key: 'name', label: '취약점명', type: 'string' }, { key: 'score', label: '점수', type: 'number' }, { key: 'affected', label: '영향 여부', type: 'boolean' }, { key: 'observedAt', label: '관측 시각', type: 'datetime' }] }, detail: { sections: [{ title: '취약점 정보', fields: [{ key: 'cve', label: 'CVE', type: 'string' }, { key: 'name', label: '취약점명', type: 'string' }, { key: 'score', label: '점수', type: 'number' }] }, { title: '영향 및 관측', fields: [{ key: 'affected', label: '영향 여부', type: 'boolean' }, { key: 'observedAt', label: '관측 시각', type: 'datetime' }] }] } },
      { title: 'HTTP 취약점', icon: 'shield', group: '보안 관리', order: 20, path: '/vulnerabilities/http', dataType: 'vulnerability', pluginId: 'vulnerabilities-http-csv', sourceId: 'mock-api-vulnerabilities-csv', list: { columns: [{ key: 'cve', label: 'CVE', type: 'string' }, { key: 'name', label: '취약점명', type: 'string' }, { key: 'score', label: '점수', type: 'number' }, { key: 'affected', label: '영향 여부', type: 'boolean' }, { key: 'observedAt', label: '관측 시각', type: 'datetime' }] }, detail: { sections: [{ title: '식별 정보', fields: [{ key: 'cve', label: 'CVE', type: 'string' }, { key: 'name', label: '취약점명', type: 'string' }] }, { title: 'HTTP 수집 결과', fields: [{ key: 'score', label: '점수', type: 'number' }, { key: 'affected', label: '영향 여부', type: 'boolean' }, { key: 'observedAt', label: '관측 시각', type: 'datetime' }] }] } },
      { title: '서버 자산', icon: 'server', group: '자산 관리', order: 10, path: '/assets/servers', dataType: 'asset', pluginId: 'sample1-offset-api', sourceId: 'mock-api-sample1', list: { columns: [{ key: 'hostname', label: '호스트명', type: 'string' }, { key: 'environment', label: '환경', type: 'string' }, { key: 'ip', label: 'IP 주소', type: 'string' }, { key: 'enabled', label: '활성 상태', type: 'boolean' }] }, detail: { sections: [{ title: '기본 정보', fields: [{ key: 'hostname', label: '호스트명', type: 'string' }, { key: 'environment', label: '환경', type: 'string' }, { key: 'ip', label: 'IP 주소', type: 'string' }] }, { title: '수집 정보', fields: [{ key: 'integerValue', label: '정수 값', type: 'number' }, { key: 'decimalValue', label: '소수 값', type: 'number' }, { key: 'enabled', label: '활성 상태', type: 'boolean' }] }] } },
      { title: '저장소', icon: 'repository', group: '자산 관리', order: 20, path: '/assets/repositories', dataType: 'repository', pluginId: 'sample2-single-api', sourceId: 'mock-api-sample2', list: { columns: [{ key: 'fullName', label: '저장소 전체 이름', type: 'string' }, { key: 'active', label: '활성 상태', type: 'boolean' }, { key: 'feed', label: '피드', type: 'string' }] }, detail: { sections: [{ title: '저장소 정보', fields: [{ key: 'assetKey', label: '자산 키', type: 'string' }, { key: 'fullName', label: '저장소 전체 이름', type: 'string' }, { key: 'active', label: '활성 상태', type: 'boolean' }, { key: 'feed', label: '피드', type: 'string' }] }, { title: '상세 구성', fields: [{ key: 'details', label: '상세 정보', type: 'object' }, { key: 'members', label: '구성원', type: 'array' }] }] } },
    ]);
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
    ['메뉴 누락', (plugin) => delete plugin.menu, '/menu'],
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
    expect(menu?.list).toEqual({ columns: [
      { key: 'fullName', label: '저장소 전체 이름', type: 'string' },
      { key: 'active', label: '활성 상태', type: 'boolean' },
      { key: 'feed', label: '피드', type: 'string' },
    ] });
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
