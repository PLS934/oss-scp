import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../dist/app.module.js';
import { createPluginRuntimeRegistry } from '../dist/plugin-runtime-registry.js';

const definition = { plugin: { id: 'sample', name: '샘플', version: '1.0.0', transformPath: '/transform.js', data: { types: {} }, menu: { title: '샘플', icon: 'server', group: '자산', order: 1, path: '/sample', dataType: 'asset' } }, connection: { id: 'source', baseUrl: 'https://example.invalid' }, request: { method: 'GET', path: '/assets', format: 'json' }, limits: { timeoutMs: 1000, maxResponseBytes: 1000, maxRecordBytes: 100 }, response: { itemsPath: '/items' }, pagination: { type: 'single' } };
const menu = { ...definition.plugin.menu, pluginId: 'sample', sourceId: 'source', list: { columns: [] }, detail: { sections: [] } };
const connection = { checkReady: async () => true, close: async () => undefined };
const query = { listRecords: async () => ({ items: [], pageInfo: { nextCursor: null, hasNextPage: false }, collection: { scope: 'source', status: 'never_collected', runId: null, startedAt: null, finishedAt: null }, lastStoredAt: null }), getRecord: async () => null };

describe('플러그인 수동 동기화 API', () => {
  let app;
  afterEach(async () => { await app?.close(); app = undefined; });

  async function start(manualSync, registry = createPluginRuntimeRegistry({ definitions: [definition], menus: [menu] })) {
    const module = await Test.createTestingModule({ imports: [AppModule.register(connection, query, registry, undefined, undefined, manualSync)] }).compile();
    app = module.createNestApplication(); await app.listen(0, '127.0.0.1'); return app.getUrl();
  }

  it('202로 먼저 접수하고 실행 중 중복을 거부한 뒤 성공 상태를 반환한다', async () => {
    let finish; const gate = new Promise(resolve => { finish = resolve; });
    const executor = vi.fn(async () => { await gate; return { exitCode: 0, status: 'success', pluginId: 'sample', result: { runId: 'run-1', status: 'success', batches: 1, processed: 1, accepted: 1, rejected: 0, checkpoint: 1 } }; });
    const url = await start({ executor });
    const accepted = await fetch(`${url}/api/v1/plugins/sample/sync-runs`, { method: 'POST' });
    expect(accepted.status).toBe(202); const request = await accepted.json(); expect(request).toMatchObject({ pluginId: 'sample', status: 'accepted' });
    const duplicate = await fetch(`${url}/api/v1/plugins/sample/sync-runs`, { method: 'POST' });
    expect(duplicate.status).toBe(409); expect(await duplicate.json()).toMatchObject({ code: 'SYNC_ALREADY_RUNNING' });
    finish(); await vi.waitFor(() => expect(executor).toHaveBeenCalledOnce());
    await vi.waitFor(async () => expect(await (await fetch(`${url}/api/v1/sync-runs/${request.requestId}`)).json()).toMatchObject({ status: 'success', runId: 'run-1' }));
  });

  it('권한을 대상 조회 전에 거부하고 대상·요청 존재 여부를 노출하지 않는다', async () => {
    const executor = vi.fn(); const authorizer = { canExecute: vi.fn(() => false) };
    const url = await start({ executor, authorizer });
    for (const [path, method] of [['/api/v1/plugins/missing/sync-runs', 'POST'], ['/api/v1/sync-runs/missing', 'GET'], ['/api/v1/plugins/missing/sync', 'GET']]) {
      const response = await fetch(`${url}${path}`, { method }); expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ code: 'SYNC_FORBIDDEN' });
    }
    expect(executor).not.toHaveBeenCalled(); expect(authorizer.canExecute).toHaveBeenCalledTimes(3);
  });

  it('없는 플러그인과 대상 없는 플러그인을 구분하고 capability를 반환한다', async () => {
    const registry = createPluginRuntimeRegistry({ definitions: [], menus: [menu] });
    const url = await start({ executor: vi.fn() }, registry);
    expect((await fetch(`${url}/api/v1/plugins/missing/sync-runs`, { method: 'POST' })).status).toBe(404);
    const noTargets = await fetch(`${url}/api/v1/plugins/sample/sync-runs`, { method: 'POST' }); expect(noTargets.status).toBe(409); expect(await noTargets.json()).toMatchObject({ code: 'NO_ACTIVE_TARGETS' });
    expect(await (await fetch(`${url}/api/v1/plugins/sample/sync`)).json()).toMatchObject({ available: true, canExecute: false, reason: 'NO_ACTIVE_TARGETS' });
  });
});
