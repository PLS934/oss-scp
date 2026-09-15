import { URLSearchParams } from 'node:url';
import 'reflect-metadata';
import { beforeAll, afterAll, expect, test, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../dist/app.module.js';
import { createPluginRuntimeRegistry } from '../dist/plugin-runtime-registry.js';
import { validateRepository } from '@oss-scp/plugin-config';
import { resolve } from 'node:path';
let app, url;
const result = { items: [], pageInfo: { nextCursor: null, hasNextPage: false }, collection: { scope: 'source', status: 'never_collected', runId: null, startedAt: null, finishedAt: null }, lastStoredAt: null };
const listRecords = vi.fn(async () => result);
beforeAll(async () => {
  const config = validateRepository(resolve(import.meta.dirname, '../../..'));
  expect(config.ok).toBe(true);
  const definition = config.definitions.find(item => item.plugin.id === 'vulnerabilities-local-csv');
  const fields = definition.plugin.data.types.vulnerability.fields;
  fields.name.searchable = true;
  fields.score.filter = { kind: 'numberRange' };
  fields.affected.filter = { kind: 'select', options: [{ value: true, label: '예' }, { value: false, label: '아니요' }] };
  fields.observedAt.filter = { kind: 'dateRange' };
  const registry = createPluginRuntimeRegistry(config);
  const module = await Test.createTestingModule({ imports: [AppModule.register({ checkReady: async () => true, close: async () => {} }, { listRecords, getRecord: async () => null }, registry)] }).compile();
  app = module.createNestApplication(); await app.listen(0, '127.0.0.1'); url = await app.getUrl();
});
afterAll(async () => { await app?.close(); });
const params = () => new URLSearchParams({ pluginId: 'vulnerabilities-local-csv', sourceId: 'file:fixtures/csv/vulnerabilities.csv', dataType: 'vulnerability' });
test('등록 정의에 맞는 q·filters를 정규화하여 전달한다', async () => {
  const query = params(); query.set('q', ' ABC %_\\ '); query.set('filters', JSON.stringify([{ field: 'score', kind: 'numberRange', min: 0, max: 10 }, { field: 'affected', kind: 'select', value: false }]));
  const response = await fetch(`${url}/api/v1/records?${query}`);
  expect(response.status).toBe(200);
  expect(listRecords.mock.lastCall[0].conditions).toMatchObject({ q: 'abc %_\\', filters: [{ field: 'affected', kind: 'select', value: false }, { field: 'score', kind: 'numberRange', min: 0, max: 10 }] });
});
test('등록된 번호형 단일 정렬을 타입과 함께 전달한다', async () => {
  const query = params(); query.set('page', '1'); query.set('sort', 'score'); query.set('direction', 'desc');
  const response = await fetch(`${url}/api/v1/records?${query}`);
  expect(response.status).toBe(200);
  expect(listRecords.mock.lastCall[0].sort).toEqual({ field: 'score', type: 'number', direction: 'desc' });
});
test.each([
  query => query.set('filters', '{'),
  query => query.set('filters', '{}'),
  query => query.set('filters', JSON.stringify([{ field: 'secret', kind: 'select', value: 1 }])),
  query => query.set('filters', JSON.stringify([{ field: 'affected', kind: 'select', value: 'false' }])),
  query => query.set('filters', JSON.stringify([{ field: 'score', kind: 'numberRange', min: 10, max: 1 }])),
  query => query.set('filters', JSON.stringify([{ field: 'observedAt', kind: 'dateRange', to: '2026-02-30' }])),
  query => { query.append('q', 'a'); query.append('q', 'b'); },
  query => { query.append('filters', '[]'); query.append('filters', '[]'); },
  query => query.set('q', 'x'.repeat(201)),
  query => { query.set('q', 'a'); query.set('pluginId', 'unknown'); },
  query => { query.set('q', 'a'); query.set('sourceId', 'other'); },
  query => { query.set('page', '1'); query.set('sort', 'secret'); query.set('direction', 'asc'); },
  query => { query.set('page', '1'); query.set('sort', 'score'); },
  query => { query.set('page', '1'); query.set('sort', 'score'); query.set('direction', 'up'); },
  query => { query.set('sort', 'score'); query.set('direction', 'asc'); },
  query => { query.set('page', '1'); query.append('sort', 'score'); query.append('sort', 'name'); query.set('direction', 'asc'); },
])('잘못된 조건을 DB 접근 전에 안정적인 400으로 거부한다 (%#)', async edit => {
  const query = params(); edit(query); listRecords.mockClear();
  const response = await fetch(`${url}/api/v1/records?${query}`);
  expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: 'INVALID_QUERY' }); expect(listRecords).not.toHaveBeenCalled();
});
test('미등록 범위의 무조건 조회와 빈 조건은 기존 호출을 유지한다', async () => {
  const query = params(); query.set('pluginId', 'unknown'); query.set('q', ' '); query.set('filters', '[]');
  expect((await fetch(`${url}/api/v1/records?${query}`)).status).toBe(200);
});
test('조회 실패는 내부 오류를 노출하지 않는다', async () => {
  listRecords.mockRejectedValueOnce(new Error('secret-database-password'));
  const response = await fetch(`${url}/api/v1/records?${params()}`);
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('secret');
});
