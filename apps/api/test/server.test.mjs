import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodeRecordCursor } from '@oss-scp/platform-db';
import { Test } from '@nestjs/testing';
import { AppModule } from '../dist/app.module.js';
import { readConfig } from '../dist/config.js';
import { createPluginRuntimeRegistry } from '../dist/plugin-runtime-registry.js';
import { formatConfigurationIssues } from '../dist/configuration-errors.js';

describe('HTTP 계약과 Nest 의존성 주입', () => {
  let app;
  let url;
  beforeAll(async () => {
    const connection = { checkReady: async () => true, close: async () => undefined };
    const module = await Test.createTestingModule({ imports: [AppModule.register(connection)] }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });
  it('인증 없이 정확한 상태 JSON을 반환한다', async () => {
    const response = await fetch(`${url}/api/v1/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
  it('정의되지 않은 경로는 404를 반환한다', async () => {
    expect((await fetch(`${url}/api/v1/missing`)).status).toBe(404);
  });
  it('DB 준비 상태를 별도 경로로 반환한다', async () => {
    const response = await fetch(`${url}/api/v1/ready`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready' });
  });
});

describe('준비되지 않은 DB', () => {
  it('liveness는 유지하고 readiness만 503으로 반환한다', async () => {
    const connection = { checkReady: async () => false, close: async () => undefined };
    const module = await Test.createTestingModule({ imports: [AppModule.register(connection)] }).compile();
    const app = module.createNestApplication(); await app.listen(0, '127.0.0.1');
    try {
      const url = await app.getUrl();
      expect((await fetch(`${url}/api/v1/health`)).status).toBe(200);
      const ready = await fetch(`${url}/api/v1/ready`);
      expect(ready.status).toBe(503);
      expect(await ready.json()).toEqual({ status: 'not_ready' });
    } finally { await app.close(); }
  });
});

describe('실행 설정', () => {
  it('기본값과 사용자 설정을 사용한다', () => {
    expect(readConfig({ OSS_SCP_CONFIG_ROOT: '/config' })).toEqual({ host: '127.0.0.1', port: 3000, configRoot: '/config' });
    expect(readConfig({ HOST: '0.0.0.0', PORT: '4321', OSS_SCP_CONFIG_ROOT: '/config' })).toEqual({ host: '0.0.0.0', port: 4321, configRoot: '/config' });
    expect(readConfig({ PORT: '65535', OSS_SCP_CONFIG_ROOT: '/config' }).port).toBe(65535);
    expect(() => readConfig({})).toThrow('OSS_SCP_CONFIG_ROOT');
  });
  it.each(['', '0', '-1', '65536', '1.5', 'abc', '3000x', ' 3000', '1e3'])('잘못된 포트 %s를 거부한다', (PORT) => {
    expect(() => readConfig({ PORT, OSS_SCP_CONFIG_ROOT: '/config' })).toThrow('PORT');
  });
});

describe('플러그인 메뉴 API', () => {
  it('검증된 비민감 메뉴만 반환한다', async () => {
    const connection = { checkReady: async () => true, close: async () => undefined };
    const menus = [{ title: '서버', icon: 'server', group: '자산', order: 10, path: '/servers', dataType: 'asset', pluginId: 'sample', sourceId: 'source', list: { columns: [{ key: 'hostname', label: '호스트명', type: 'string' }] }, detail: { sections: [{ title: '기본 정보', fields: [{ key: 'hostname', label: '호스트명', type: 'string' }] }] } }];
    const registry = createPluginRuntimeRegistry({ definitions: [], menus });
    const registered = AppModule.register(connection, undefined, registry);
    expect(registered.providers.find(provider => provider.provide?.description === 'PLUGIN_RUNTIME_REGISTRY').useValue).toBe(registry);
    const module = await Test.createTestingModule({ imports: [registered] }).compile();
    const app = module.createNestApplication(); await app.listen(0, '127.0.0.1');
    try {
      const response = await fetch(`${await app.getUrl()}/api/v1/plugin-menus`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(menus);
      const serialized = JSON.stringify(await (await fetch(`${await app.getUrl()}/api/v1/plugin-menus`)).json());
      expect(serialized).not.toMatch(/baseUrl|connection|sourceConfig|transformPath|password|nestedSchema/);
    } finally { await app.close(); }
  });
});

describe('플러그인 runtime registry', () => {
  it('입력과 반환값을 불변 snapshot으로 보존하고 plugin ID로 조회한다', () => {
    const definition = { plugin: { id: 'sample', name: '샘플', version: '1.0.0', transformPath: '/config/transform.js', data: { types: {} }, menu: { title: '서버', icon: 'server', group: '자산', order: 20, path: '/servers', dataType: 'asset' } }, connection: { id: 'source', baseUrl: 'https://example.invalid' }, request: { method: 'GET', path: '/assets', format: 'json' }, limits: { timeoutMs: 1000, maxResponseBytes: 1000, maxRecordBytes: 100 }, response: { itemsPath: '/items' }, pagination: { type: 'single' } };
    const menus = [
      { title: '서버', icon: 'server', group: '자산', order: 20, path: '/servers', dataType: 'asset', pluginId: 'sample', sourceId: 'source', list: { columns: [] }, detail: { sections: [] } },
      { title: '취약점', icon: 'shield', group: '보안', order: 10, path: '/findings', dataType: 'finding', pluginId: 'finding', sourceId: 'source', list: { columns: [] }, detail: { sections: [] } },
    ];
    const registry = createPluginRuntimeRegistry({ definitions: [definition], menus });
    definition.plugin.name = '변경';
    menus[0].title = '변경';
    expect(registry.getDefinition('sample')?.plugin.name).toBe('샘플');
    expect(registry.getDefinition('missing')).toBeUndefined();
    expect(registry.menus.map(menu => menu.pluginId)).toEqual(['sample', 'finding']);
    expect(Object.isFrozen(registry.definitions[0].plugin)).toBe(true);
    expect(() => { registry.menus[0].title = '실패'; }).toThrow(TypeError);
    expect(registry.menus[0].title).toBe('서버');
  });
});

describe('수집 상태 API', () => {
  it('최초 수집 전과 저장된 실행 상태를 원천 호출 없이 반환한다', async () => {
    const connection = { checkReady: async () => true, close: async () => undefined };
    const menus = [
      { title: '서버', icon: 'server', group: '자산', order: 1, path: '/servers', dataType: 'asset', pluginId: 'one', sourceId: 'source-1', list: { columns: [] }, detail: { sections: [] } },
      { title: '취약점', icon: 'shield', group: '보안', order: 2, path: '/findings', dataType: 'finding', pluginId: 'two', sourceId: 'source-2', list: { columns: [] }, detail: { sections: [] } },
    ];
    const calls = [];
    const query = { listRecords: async input => { calls.push(input); return { items: [], pageInfo: { nextCursor: null, hasNextPage: false }, lastStoredAt: null, collection: input.pluginId === 'one' ? null : { scope: 'source', status: 'running', runId: 'run-2', startedAt: '2026-09-12T00:00:00.000Z', finishedAt: null } }; }, getRecord: async () => null };
    const registry = createPluginRuntimeRegistry({ definitions: [], menus });
    const module = await Test.createTestingModule({ imports: [AppModule.register(connection, query, registry)] }).compile();
    const app = module.createNestApplication(); await app.listen(0, '127.0.0.1');
    try {
      const response = await fetch(`${await app.getUrl()}/api/v1/collection-status`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([
        { pluginId: 'one', sourceId: 'source-1', dataType: 'asset', configRevision: null, status: 'uncollected', runId: null, startedAt: null, finishedAt: null },
        { pluginId: 'two', sourceId: 'source-2', dataType: 'finding', configRevision: null, status: 'running', runId: 'run-2', startedAt: '2026-09-12T00:00:00.000Z', finishedAt: null },
      ]);
      expect(calls).toHaveLength(2);
    } finally { await app.close(); }
  });
});

describe('플러그인 설정 오류 출력', () => {
  it('모든 오류의 허용 필드만 로그 안전하게 출력한다', () => {
    const formatted = formatConfigurationIssues([
      { file: '/private/config/plugins/one/plugin.json', path: '/menu/title', message: 'invalid\nvalue', secret: 'token-value', stack: 'raw-stack' },
      { file: 'connections/two.json', path: '/config/baseUrl\r', message: 'must match\u0085schema' },
      { file: 'C:\\private\\config\\three.json', path: '/id', message: 'invalid id' },
    ]);
    expect(formatted.split('\n')).toHaveLength(3);
    expect(formatted).toContain('plugin.json /menu/title: invalid\\u000avalue');
    expect(formatted).toContain('connections/two.json /config/baseUrl\\u000d: must match\\u0085schema');
    expect(formatted).toContain('three.json /id: invalid id');
    expect(formatted).not.toMatch(/private\/config|private\\config|token-value|raw-stack/);
  });
});

describe('저장 레코드 조회 API', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const record = { id, pluginId: 'sample', sourceId: 'source', dataType: 'asset', externalKey: 'server-1', sourceValues: { hostname: 'server-1' }, firstSeenAt: '2026-09-11T01:00:00.000Z', lastSeenAt: '2026-09-11T01:01:00.000Z' };
  const list = { items: [{ ...record, omittedFields: [] }], pageInfo: { nextCursor: 'next-page', hasNextPage: true }, collection: { scope: 'source', status: 'success', runId: id, startedAt: '2026-09-11T01:00:00.000Z', finishedAt: '2026-09-11T01:02:00.000Z' }, lastStoredAt: record.lastSeenAt };
  const start = async query => {
    const connection = { checkReady: async () => true, close: async () => undefined };
    const module = await Test.createTestingModule({ imports: [AppModule.register(connection, query)] }).compile();
    const app = module.createNestApplication(); await app.listen(0, '127.0.0.1');
    return { app, url: await app.getUrl() };
  };

  it('인증 없이 목록·상세와 빈 목록을 반환하고 입력을 전달한다', async () => {
    const cursor = encodeRecordCursor({ pluginId: 'sample', sourceId: 'source', dataType: 'asset', limit: 20 }, { id, lastSeenAt: record.lastSeenAt });
    const calls = [];
    const query = { listRecords: async input => { calls.push(input); return input.dataType === 'empty' ? { ...list, items: [], pageInfo: { nextCursor: null, hasNextPage: false }, lastStoredAt: null } : list; }, getRecord: async value => value === id ? record : null };
    const { app, url } = await start(query);
    try {
      const response = await fetch(`${url}/api/v1/records?pluginId=sample&sourceId=source&dataType=asset&limit=20&cursor=${cursor}`);
      expect(response.status).toBe(200); expect(await response.json()).toEqual(list);
      expect(calls).toEqual([{ pluginId: 'sample', sourceId: 'source', dataType: 'asset', limit: 20, cursor }]);
      expect((await fetch(`${url}/api/v1/records?pluginId=sample&sourceId=source&dataType=empty`)).status).toBe(200);
      const detail = await fetch(`${url}/api/v1/records/${id}`); expect(detail.status).toBe(200); expect(await detail.json()).toEqual(record);
    } finally { await app.close(); }
  });

  it('잘못된 입력·없는 레코드·저장소 장애를 고정 오류로 변환한다', async () => {
    const { QueryError } = await import('@oss-scp/platform-db');
    const query = { listRecords: async input => { if (input.cursor === 'bad') throw new QueryError('INVALID_CURSOR'); if (!input.pluginId || Number.isNaN(input.limit)) throw new QueryError('INVALID_QUERY'); throw new Error('sensitive SQL password'); }, getRecord: async value => { if (value === id) return null; throw new QueryError('INVALID_QUERY'); } };
    const { app, url } = await start(query);
    try {
      for (const path of ['/api/v1/records?sourceId=s&dataType=asset', '/api/v1/records?pluginId=p&sourceId=s&dataType=asset&limit=1.5', '/api/v1/records/not-a-uuid']) {
        const response = await fetch(`${url}${path}`); expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: 'INVALID_QUERY', message: '조회 입력을 확인하세요.' });
      }
      const invalidCursor = await fetch(`${url}/api/v1/records?pluginId=p&sourceId=s&dataType=asset&cursor=bad`); expect(invalidCursor.status).toBe(400); expect(await invalidCursor.json()).toMatchObject({ code: 'INVALID_CURSOR' });
      const missing = await fetch(`${url}/api/v1/records/${id}`); expect(missing.status).toBe(404); expect(await missing.json()).toMatchObject({ code: 'RECORD_NOT_FOUND' });
      const failed = await fetch(`${url}/api/v1/records?pluginId=p&sourceId=s&dataType=asset`); expect(failed.status).toBe(503); expect(JSON.stringify(await failed.json())).not.toContain('sensitive');
    } finally { await app.close(); }
  });

  it('번호형 page 입력과 응답을 보존하고 중복·혼합·잘못된 숫자를 거부한다', async () => {
    const { validateListRecordsInput } = await import('@oss-scp/platform-db');
    const calls = [];
    const numbered = { ...list, pageInfo: { page: 2, pageSize: 20, totalItems: 45, totalPages: 3, hasNextPage: true } };
    const { app, url } = await start({ listRecords: async input => { validateListRecordsInput(input); calls.push(input); return numbered; }, getRecord: async () => null });
    const endpoint = `${url}/api/v1/records?pluginId=sample&sourceId=source&dataType=asset`;
    try {
      const response = await fetch(`${endpoint}&page=2&limit=20`);
      expect(response.status).toBe(200); expect(await response.json()).toEqual(numbered);
      expect(calls).toEqual([{ pluginId: 'sample', sourceId: 'source', dataType: 'asset', page: 2, limit: 20 }]);
      for (const suffix of ['page=', 'page=0', 'page=-1', 'page=1.5', 'page=abc', 'page=1e2', 'page=9007199254740992', 'page=9007199254740991', 'page=1&page=2', 'page=1&cursor=', 'page=1&cursor=bad']) {
        const invalid = await fetch(`${endpoint}&${suffix}`);
        expect(invalid.status, suffix).toBe(400);
        expect(await invalid.json()).toMatchObject({ code: 'INVALID_QUERY' });
      }
      expect(calls).toHaveLength(1);
    } finally { await app.close(); }
  });

  it('조회 요청은 조회 계약 외의 수집·저장 기능을 호출하지 않는다', async () => {
    let reads = 0; let writes = 0;
    const query = { listRecords: async () => { reads += 1; return list; }, getRecord: async () => { reads += 1; return record; }, startRun: async () => { writes += 1; } };
    const { app, url } = await start(query);
    try { await fetch(`${url}/api/v1/records?pluginId=p&sourceId=s&dataType=asset`); await fetch(`${url}/api/v1/records/${id}`); expect({ reads, writes }).toEqual({ reads: 2, writes: 0 }); } finally { await app.close(); }
  });
});

describe('등록 플러그인 API', () => {
  it('활성·비활성 등록 정보를 반환하고 내부 속성은 제외한다', async () => {
    const connection = { checkReady: async () => true, close: async () => undefined };
    const plugins = [
      { id: 'active', name: 'API', description: '외부 데이터', enabled: true, sourceType: 'http-json', password: 'never-expose', connection: { baseUrl: 'https://secret.invalid' } },
      { id: 'disabled', name: 'CSV', enabled: false, sourceType: 'local-csv', transformPath: '/private/transform.js' },
    ];
    const registry = createPluginRuntimeRegistry({ definitions: [], menus: [], plugins });
    plugins[0].name = '변경';
    const module = await Test.createTestingModule({ imports: [AppModule.register(connection, undefined, registry)] }).compile();
    const app = module.createNestApplication(); await app.listen(0, '127.0.0.1');
    try {
      const response = await fetch(`${await app.getUrl()}/api/v1/plugins`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([
        { id: 'active', name: 'API', description: '외부 데이터', enabled: true, sourceType: 'http-json' },
        { id: 'disabled', name: 'CSV', enabled: false, sourceType: 'local-csv' },
      ]);
    } finally { await app.close(); }
  });
});
