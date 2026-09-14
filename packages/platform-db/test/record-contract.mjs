import { expect } from 'vitest';

export async function verifyRecordContract(storage, query, scope) {
  const runId = await storage.startRun({ ...scope, startedAt: '2026-09-11T05:00:00.000Z' });
  const records = Array.from({ length: 25 }, (_, index) => ({
    type: index === 24 ? 'finding' : 'asset',
    key: index === 0 ? 'CaseKey' : index === 1 ? 'casekey' : index,
    values: { index, nullable: null, datetime: '2026-09-11T05:00:00.000Z', nested: { enabled: true } },
  }));
  await storage.commitBatch({
    runId, scope, observedAt: '2026-09-11T05:01:00.000Z', expectedCheckpoint: null, nextCheckpoint: { offset: 25 },
    processedCount: 25, acceptedCount: 25, records,
    relations: [{ type: 'has-finding', from: { type: 'asset', key: 'CaseKey' }, to: { type: 'finding', key: 24 } }], issues: [],
  });
  const first = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', limit: 20 });
  const second = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', limit: 20, cursor: first.pageInfo.nextCursor });
  expect(first.items).toHaveLength(20);
  expect(second.items).toHaveLength(4);
  expect(second.pageInfo).toEqual({ nextCursor: null, hasNextPage: false });
  const all = [...first.items, ...second.items];
  expect(new Set(all.map(item => item.id)).size).toBe(24);
  expect(all.map(item => item.id)).toEqual([...all.map(item => item.id)].sort());
  expect(all.map(item => item.externalKey)).toEqual(expect.arrayContaining(['CaseKey', 'casekey', 2]));
  expect(all[0].sourceValues).toMatchObject({ nullable: null, datetime: '2026-09-11T05:00:00.000Z', nested: { enabled: true } });

  for (const limit of [20, 50, 100, 200]) {
    const numberedFirst = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', limit, page: 1 });
    expect(numberedFirst.items).toEqual(all.slice(0, limit));
    expect(numberedFirst.pageInfo).toEqual({ page: 1, pageSize: limit, totalItems: 24, totalPages: Math.ceil(24 / limit), hasNextPage: limit < 24 });
    const last = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', limit, page: 999 });
    expect(last.pageInfo.page).toBe(Math.ceil(24 / limit));
    expect(last.pageInfo.hasNextPage).toBe(false);
    expect(last.items).toEqual(limit === 20 ? all.slice(20) : all);
  }
  const empty = await query.listRecords({ pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'absent', page: 99 });
  expect(empty.items).toEqual([]);
  expect(empty.pageInfo).toEqual({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasNextPage: false });

  const identity = all.find(item => item.externalKey === 'CaseKey');
  const nextRun = await storage.startRun({ ...scope, startedAt: '2026-09-11T06:00:00.000Z' });
  await storage.commitBatch({
    runId: nextRun, scope, observedAt: '2026-09-11T06:01:00.000Z', expectedCheckpoint: { offset: 25 }, nextCheckpoint: { offset: 26 },
    processedCount: 1, acceptedCount: 1, records: [{ type: 'asset', key: 'CaseKey', values: { updated: true } }], relations: [], issues: [],
  });
  expect(await query.getRecord(identity.id)).toMatchObject({ id: identity.id, sourceValues: { updated: true }, firstSeenAt: '2026-09-11T05:01:00.000Z', lastSeenAt: '2026-09-11T06:01:00.000Z' });
}


export async function verifyNumberedSnapshot(storage, connection, createQuery, scope) {
  const runId = await storage.startRun({ ...scope, startedAt: '2026-09-11T05:00:00.000Z' });
  const commit = (records, expectedCheckpoint, nextCheckpoint) => storage.commitBatch({
    runId, scope, observedAt: '2026-09-11T05:01:00.000Z', expectedCheckpoint, nextCheckpoint,
    processedCount: records.length, acceptedCount: records.length, records, relations: [], issues: [],
  });
  await commit([{ type: 'asset', key: 'before', values: {} }], null, { offset: 1 });
  let changed = false;
  const intercepted = { withClient: work => connection.withClient(client => work({ query: async (sql, parameters) => {
    const result = await client.query(sql, parameters);
    if (sql.includes('count(*)') && !changed) {
      changed = true;
      await commit([{ type: 'asset', key: 'after', values: {} }], { offset: 1 }, { offset: 2 });
    }
    return result;
  } })) };
  const input = { pluginId: scope.pluginId, sourceId: scope.sourceId, dataType: 'asset', page: 1 };
  const snapshot = await createQuery(intercepted).listRecords(input);
  expect(changed).toBe(true);
  expect(snapshot.pageInfo.totalItems).toBe(1);
  expect(snapshot.items.map(item => item.externalKey)).toEqual(['before']);
  const fresh = await createQuery(connection).listRecords(input);
  expect(fresh.pageInfo.totalItems).toBe(2);
  expect(fresh.items).toHaveLength(2);
}
