import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { GenericContainer, Wait } from 'testcontainers';
import { Pool } from 'pg';
import { normalizeRecordConditions, validateListRecordsInput } from '@oss-scp/platform-db';
import { validateRepository } from '@oss-scp/plugin-config';
import { LiveQueryManager } from '../dist/live-query.js';
import { createPluginRuntimeRegistry } from '../dist/plugin-runtime-registry.js';

const password = 'live-integration-password';
let container;
let setup;
let manager;
let registry;

beforeAll(async () => {
  container = await new GenericContainer('postgres:17.6-bookworm')
    .withEnvironment({ POSTGRES_DB: 'dependency_track', POSTGRES_USER: 'dependency_track_reader', POSTGRES_PASSWORD: password })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2)).start();
  setup = new Pool({ host: container.getHost(), port: container.getMappedPort(5432), database: 'dependency_track', user: 'dependency_track_reader', password });
  await setup.query(`
    CREATE TABLE projects(id integer PRIMARY KEY, name text NOT NULL, severity text, updated_at timestamptz NOT NULL);
    CREATE TABLE components(id integer PRIMARY KEY, name text NOT NULL, severity text, updated_at timestamptz NOT NULL);
    CREATE TABLE sscs(id integer PRIMARY KEY, name text NOT NULL, severity text, updated_at timestamptz NOT NULL);
    INSERT INTO projects SELECT n, CASE WHEN n = 509 THEN E'literal\\\\match' WHEN n = 510 THEN 'literal%_match' ELSE 'project-' || lpad(n::text, 3, '0') END, CASE WHEN n % 2 = 0 THEN 'high' ELSE 'low' END, '2026-09-17T00:00:00Z' FROM generate_series(1, 510) n;
    INSERT INTO components VALUES (1, 'same-name', 'critical', '2026-09-17T01:00:00Z');
    INSERT INTO sscs VALUES (1, 'same-name', NULL, '2026-09-17T02:00:00Z');
  `);
  process.env.DEPENDENCY_TRACK_DB_PASSWORD = password;
  const root = resolve(import.meta.dirname, '../../..');
  const configuration = validateRepository(root);
  if (!configuration.ok) throw new Error(JSON.stringify(configuration.errors));
  const live = JSON.parse(JSON.stringify(configuration.definitions.find(item => item.plugin.id === 'dependency-track-db')));
  live.connection.config.host = container.getHost(); live.connection.config.port = container.getMappedPort(5432);
  registry = createPluginRuntimeRegistry({ definitions: [live], menus: configuration.menus.filter(item => item.pluginId === 'dependency-track-db'), configRoot: root });
  manager = new LiveQueryManager(registry);
}, 120_000);

afterAll(async () => { await manager?.close(); await setup?.end(); await container?.stop(); delete process.env.DEPENDENCY_TRACK_DB_PASSWORD; });

describe('PostgreSQL 라이브 UNION 조회', () => {
  const declaration = { searchFields: ['name'], filters: [
    { key: 'entity_kind', type: 'string', kind: 'multiSelect', options: [{ value: 'project', label: '프로젝트' }, { value: 'component', label: '컴포넌트' }, { value: 'sscs', label: 'SSCS' }] },
    { key: 'severity', type: 'string', kind: 'select', options: [{ value: 'high', label: 'High' }] },
  ] };
  const input = (conditions, patch = {}) => validateListRecordsInput({ pluginId: 'dependency-track-db', sourceId: 'dependency-track-postgres', dataType: 'dependency-item', page: 1, limit: 20, conditions, ...patch });

  it('UNION 전체에서 500번째 이후 literal 검색을 하고 세 종류의 키 충돌을 피한다', async () => {
    const literal = normalizeRecordConditions('literal%_', undefined, declaration);
    const result = await manager.list('dependency-track-db', 'dependency-track-postgres', 'dependency-item', input(literal), 'revision-a');
    expect(result.items.map(item => item.externalKey)).toEqual(['project:510']);
    const slash = await manager.list('dependency-track-db', 'dependency-track-postgres', 'dependency-item', input(normalizeRecordConditions('literal\\', undefined, declaration)), 'revision-slash');
    expect(slash.items.map(item => item.externalKey)).toEqual(['project:509']);
    const all = await manager.list('dependency-track-db', 'dependency-track-postgres', 'dependency-item', input(normalizeRecordConditions(undefined, undefined, declaration), { limit: 20 }), 'revision-b');
    expect(all.pageInfo.totalItems).toBe(512);
    await expect(Promise.all(['project:1', 'component:1', 'sscs:1'].map(key => manager.detail('dependency-track-db', 'dependency-track-postgres', 'dependency-item', key)))).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ externalKey: 'project:1' }), expect.objectContaining({ externalKey: 'component:1' }), expect.objectContaining({ externalKey: 'sscs:1' }),
    ]));
  });

  it('동률 정렬은 외부 키로 안정화하고 null 필터 값은 임의로 일치시키지 않는다', async () => {
    const conditions = normalizeRecordConditions(undefined, JSON.stringify([{ field: 'entity_kind', kind: 'multiSelect', values: ['component', 'sscs'] }]), declaration);
    const result = await manager.list('dependency-track-db', 'dependency-track-postgres', 'dependency-item', input(conditions, { sort: { field: 'name', type: 'string', direction: 'asc' } }), 'ties');
    expect(result.items.map(item => item.externalKey)).toEqual(['component:1', 'sscs:1']);
    expect(result.items[1].sourceValues.severity).toBeNull();
  });

  it('없는 상세, 중복 상세와 1행 1레코드 위반을 구분한다', async () => {
    await expect(manager.detail('dependency-track-db', 'dependency-track-postgres', 'dependency-item', 'missing:1')).resolves.toBeNull();
    const duplicate = JSON.parse(JSON.stringify(registry.definitions[0]));
    duplicate.source.detailQuery = `SELECT * FROM (${duplicate.source.detailQuery}) one UNION ALL SELECT * FROM (${duplicate.source.detailQuery}) two`;
    const duplicateManager = new LiveQueryManager(createPluginRuntimeRegistry({ definitions: [duplicate], menus: registry.menus, configRoot: registry.configRoot }));
    await expect(duplicateManager.detail('dependency-track-db', 'dependency-track-postgres', 'dependency-item', 'project:1')).rejects.toMatchObject({ code: 'QUERY_FAILED' });
    await duplicateManager.close();

    const invalid = JSON.parse(JSON.stringify(registry.definitions[0]));
    invalid.plugin.transformPath = resolve(import.meta.dirname, 'fixtures/invalid-live-transform.cjs'); delete invalid.source.cache;
    const invalidManager = new LiveQueryManager(createPluginRuntimeRegistry({ definitions: [invalid], menus: registry.menus, configRoot: registry.configRoot }));
    const request = input(normalizeRecordConditions('project-001', undefined, declaration));
    await expect(invalidManager.list('dependency-track-db', 'dependency-track-postgres', 'dependency-item', request, 'invalid-transform')).rejects.toMatchObject({ code: 'QUERY_FAILED' });
    await invalidManager.close();
  });

  it('필터와 정렬을 pagination 전에 적용하고 캐시 revision을 분리한다', async () => {
    const conditions = normalizeRecordConditions(undefined, JSON.stringify([{ field: 'severity', kind: 'select', value: 'high' }]), declaration);
    const sorted = input(conditions, { sort: { field: 'name', type: 'string', direction: 'desc' } });
    const first = await manager.list('dependency-track-db', 'dependency-track-postgres', 'dependency-item', sorted, 'revision-c');
    expect(first.pageInfo.totalItems).toBe(255); expect(first.items[0].sourceValues.name).toBe('project-508');
    await setup.query("UPDATE projects SET name = 'changed' WHERE id = 508");
    expect((await manager.list('dependency-track-db', 'dependency-track-postgres', 'dependency-item', sorted, 'revision-c')).items[0].sourceValues.name).toBe('project-508');
    expect((await manager.list('dependency-track-db', 'dependency-track-postgres', 'dependency-item', sorted, 'revision-d')).items[0].sourceValues.name).not.toBe('project-508');
  });

  it('동일 cache key 요청을 합치고 600초 뒤 성공 결과를 만료한다', async () => {
    let now = 0; let executions = 0;
    const cached = new LiveQueryManager(registry, () => now);
    cached.executeList = async () => { executions += 1; await new Promise(resolve => setTimeout(resolve, 10)); return { mode: 'live', items: [], pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasNextPage: false }, queriedAt: new Date(now).toISOString() }; };
    const request = input(normalizeRecordConditions(undefined, undefined, declaration));
    await Promise.all([cached.list('dependency-track-db', 'dependency-track-postgres', 'dependency-item', request, 'same'), cached.list('dependency-track-db', 'dependency-track-postgres', 'dependency-item', request, 'same')]);
    expect(executions).toBe(1);
    now = 599_999; await cached.list('dependency-track-db', 'dependency-track-postgres', 'dependency-item', request, 'same'); expect(executions).toBe(1);
    now = 600_000; await cached.list('dependency-track-db', 'dependency-track-postgres', 'dependency-item', request, 'same'); expect(executions).toBe(2);
    await cached.close();
  });

  it('statement timeout 뒤 연결을 rollback하여 다음 요청을 정상 처리한다', async () => {
    const slowDefinition = JSON.parse(JSON.stringify(registry.definitions[0]));
    slowDefinition.source.listQuery = "SELECT 'project'::text AS entity_kind, 'project:slow'::text AS external_key, 'slow'::text AS name, 'high'::text AS severity, '2026-09-17T00:00:00Z'::text AS updated_at FROM pg_sleep(2)";
    slowDefinition.source.limits.timeoutMs = 100; delete slowDefinition.source.cache;
    const slowRegistry = createPluginRuntimeRegistry({ definitions: [slowDefinition], menus: registry.menus, configRoot: registry.configRoot });
    const slow = new LiveQueryManager(slowRegistry);
    const request = input(normalizeRecordConditions(undefined, undefined, declaration));
    await expect(slow.list('dependency-track-db', 'dependency-track-postgres', 'dependency-item', request, 'slow')).rejects.toMatchObject({ code: 'QUERY_FAILED' });
    slowDefinition.source.listQuery = registry.definitions[0].source.listQuery;
    await expect(manager.list('dependency-track-db', 'dependency-track-postgres', 'dependency-item', request, 'after-timeout')).resolves.toMatchObject({ mode: 'live' });
    await slow.close();
  });
});
