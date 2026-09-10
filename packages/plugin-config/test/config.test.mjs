import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { validateRepository } from '../dist/index.js';

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
  test('sample1 설정을 내부 수집 정의로 해석한다', () => {
    const result = validateRepository(repositoryRoot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definitions).toHaveLength(2);
    expect(result.definitions[0]).toEqual({
      plugin: {
        id: 'sample1-offset-api',
        name: 'Sample 1 Offset API',
        version: '0.1.0',
      },
      connection: { id: 'mock-api', baseUrl: 'http://127.0.0.1:3001' },
      request: { method: 'GET', path: '/sample1', format: 'json' },
      response: { itemsPath: 'rows', totalPath: 'total' },
      pagination: {
        type: 'offset',
        offsetParam: 'offset',
        limitParam: 'limit',
        start: 0,
        limit: 20,
      },
    });
    expect(result.definitions[1]).toEqual({
      plugin: {
        id: 'vulnerabilities-local-csv',
        name: 'Vulnerabilities Local CSV',
        version: '0.1.0',
      },
      source: {
        transport: 'file',
        format: 'csv',
        path: join(repositoryRoot, 'fixtures/csv/vulnerabilities.csv'),
      },
      batching: { size: 20 },
      limits: {},
    });
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
    writeJson(root, 'connections/mock-api.json', {
      apiVersion: 'oss-scp/connection-v1',
      id: 'other-source',
      connector: 'http',
      config: { baseUrl: 'https://inventory.example.test' },
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
      response: { itemsPath: 'data.items', totalPath: 'meta.count' },
      pagination: { offsetParam: 'skip', limitParam: 'take', start: 10, limit: 17 },
    });
  });

  test.each([
    ['필수값 누락', (source) => delete source.itemsPath, '/itemsPath'],
    ['추가 속성', (source) => (source.baseUrl = 'https://wrong.example'), '/baseUrl'],
    ['지원하지 않는 방식', (source) => (source.pagination.type = 'single'), '/pagination/type'],
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
    const connection = readJson(root, 'connections/mock-api.json');
    connection.password = 'DO_NOT_PRINT_THIS_SECRET';
    writeJson(root, 'connections/mock-api.json', connection);
    writeJson(root, 'connections/duplicate.json', {
      apiVersion: 'oss-scp/connection-v1',
      id: 'mock-api',
      connector: 'http',
      config: { baseUrl: 'https://duplicate.example.test' },
    });
    writeJson(root, 'connections/registry.json', {
      connections: ['./mock-api.json', './duplicate.json'],
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
      id: 'mock-api',
      connector: 'http',
      config: { baseUrl: 'https://duplicate.example.test' },
    });
    writeJson(root, 'connections/registry.json', {
      connections: ['./mock-api.json', './duplicate.json'],
    });

    const result = validateRepository(root);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        file: 'connections/duplicate.json',
        path: '/id',
        message: 'duplicate connection id: mock-api',
      }),
    );
  });
});
