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

  const identity = all.find(item => item.externalKey === 'CaseKey');
  const nextRun = await storage.startRun({ ...scope, startedAt: '2026-09-11T06:00:00.000Z' });
  await storage.commitBatch({
    runId: nextRun, scope, observedAt: '2026-09-11T06:01:00.000Z', expectedCheckpoint: { offset: 25 }, nextCheckpoint: { offset: 26 },
    processedCount: 1, acceptedCount: 1, records: [{ type: 'asset', key: 'CaseKey', values: { updated: true } }], relations: [], issues: [],
  });
  expect(await query.getRecord(identity.id)).toMatchObject({ id: identity.id, sourceValues: { updated: true }, firstSeenAt: '2026-09-11T05:01:00.000Z', lastSeenAt: '2026-09-11T06:01:00.000Z' });
}
