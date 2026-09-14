import { expect, test, vi } from 'vitest';
import { getRecord, listRecords } from '../src/records';

const id = '00000000-0000-4000-8000-000000000001';
const record = {
  id, pluginId: 'sample', sourceId: 'source', dataType: 'asset', externalKey: 'server-1',
  sourceValues: { hostname: 'server-1', nested: { enabled: true }, ports: [80, 443] },
  firstSeenAt: '2026-09-11T01:00:00.000Z', lastSeenAt: '2026-09-11T01:01:00.000Z',
};
const list = {
  items: [{ ...record, omittedFields: [] }],
  pageInfo: { nextCursor: 'opaque-token', hasNextPage: true },
  collection: { scope: 'source', status: 'success', runId: id, startedAt: '2026-09-11T01:00:00.000Z', finishedAt: '2026-09-11T01:02:00.000Z' },
  lastStoredAt: record.lastSeenAt,
};

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

test('첫 목록과 cursor 후속 목록을 동일 출처 URL로 안전하게 직렬화한다', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(json(list));
  const first = await listRecords({ pluginId: 'sample plugin', sourceId: 'source/a', dataType: 'asset', limit: 20 }, { request });
  expect(first).toEqual({ ok: true, data: list });
  expect(request.mock.calls[0][0]).toBe('/api/v1/records?pluginId=sample+plugin&sourceId=source%2Fa&dataType=asset&limit=20');

  await listRecords({ pluginId: 'sample', sourceId: 'source', dataType: 'asset', limit: 50, cursor: 'opaque+/=?' }, { request });
  expect(request.mock.calls[1][0]).toBe('/api/v1/records?pluginId=sample&sourceId=source&dataType=asset&limit=50&cursor=opaque%2B%2F%3D%3F');
});

test.each([
  { pluginId: '', sourceId: 's', dataType: 'asset' },
  { pluginId: ' ', sourceId: 's', dataType: 'asset' },
  { pluginId: 'p', sourceId: '', dataType: 'asset' },
  { pluginId: 'p', sourceId: 's', dataType: 'asset', limit: 10 },
])('잘못된 목록 입력은 fetch 전에 거부한다: %o', async (input) => {
  const request = vi.fn<typeof fetch>();
  expect(await listRecords(input as Parameters<typeof listRecords>[0], { request })).toMatchObject({ ok: false, error: { kind: 'INVALID_INPUT' } });
  expect(request).not.toHaveBeenCalled();
});

test('상세 UUID를 검증하고 안전한 상대 경로로 요청한다', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(json({ ...record, futureField: 'ignored' }));
  expect(await getRecord(id, { request })).toMatchObject({ ok: true, data: record });
  expect(request.mock.calls[0][0]).toBe(`/api/v1/records/${id}`);
  request.mockClear();
  expect(await getRecord('../secret', { request })).toMatchObject({ ok: false, error: { kind: 'INVALID_INPUT' } });
  expect(request).not.toHaveBeenCalled();
});

test('빈 목록과 미수집 상태를 정상 결과로 반환한다', async () => {
  const empty = { items: [], pageInfo: { nextCursor: null, hasNextPage: false }, collection: { scope: 'source', status: 'never_collected', runId: null, startedAt: null, finishedAt: null }, lastStoredAt: null, futureField: true };
  const result = await listRecords({ pluginId: 'p', sourceId: 's', dataType: 'asset' }, { request: vi.fn<typeof fetch>().mockResolvedValue(json(empty)) });
  expect(result).toEqual({ ok: true, data: empty });
});

test.each([
  ['not-json', new Response('<html>', { status: 200 }), 'INVALID_RESPONSE'],
  ['wrong content type', new Response(JSON.stringify(list), { status: 200, headers: { 'content-type': 'text/html' } }), 'INVALID_RESPONSE'],
  ['missing field', json({ ...list, pageInfo: {} }), 'INVALID_RESPONSE'],
  ['invalid JSON value', { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ ...list, items: [{ ...list.items[0], sourceValues: { value: Number.NaN } }] }) } as Response, 'INVALID_RESPONSE'],
  ['invalid cursor', json({ code: 'INVALID_CURSOR', message: 'private cursor content' }, 400), 'INVALID_CURSOR'],
  ['unknown bad request', json({ code: 'INVALID_QUERY' }, 400), 'API_ERROR'],
  ['missing detail', json({ code: 'RECORD_NOT_FOUND' }, 404), 'NOT_FOUND'],
  ['not ready', json({ code: 'QUERY_FAILED', detail: 'password=private' }, 503), 'NOT_READY'],
  ['other API error', json({ detail: 'private response' }, 500), 'API_ERROR'],
])('%s 응답을 안전한 오류로 분류한다', async (_name, response, kind) => {
  const result = await listRecords({ pluginId: 'p', sourceId: 's', dataType: 'asset' }, { request: vi.fn<typeof fetch>().mockResolvedValue(response) });
  expect(result).toMatchObject({ ok: false, error: { kind } });
  expect(JSON.stringify(result)).not.toMatch(/password|private/);
});

test('네트워크 오류와 취소를 구분하고 signal을 전달한다', async () => {
  const offline = await getRecord(id, { request: vi.fn<typeof fetch>().mockRejectedValue(new Error('private network failure')) });
  expect(offline).toMatchObject({ ok: false, error: { kind: 'NETWORK_ERROR' } });
  expect(JSON.stringify(offline)).not.toContain('private');

  const controller = new AbortController();
  const request = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
  const pending = listRecords({ pluginId: 'p', sourceId: 's', dataType: 'asset' }, { request, signal: controller.signal });
  expect(request.mock.calls[0][1]?.signal).toBe(controller.signal);
  controller.abort();
  expect(await pending).toMatchObject({ ok: false, error: { kind: 'ABORTED' } });

  expect(await getRecord(id, { request, signal: controller.signal })).toMatchObject({ ok: false, error: { kind: 'ABORTED' } });
  expect(request).toHaveBeenCalledTimes(1);
});

const scope = { pluginId: 'sample', sourceId: 'source', dataType: 'asset' };
const numbered = { ...list, pageInfo: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2, hasNextPage: false } };

test('번호형 입력을 직렬화하고 마지막 페이지 응답을 검증한다', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(json(numbered));
  expect(await listRecords({ ...scope, page: 2, limit: 20 }, { request })).toEqual({ ok: true, data: numbered });
  expect(request.mock.calls[0][0]).toBe('/api/v1/records?pluginId=sample&sourceId=source&dataType=asset&limit=20&page=2');
});

test.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])('잘못된 page %s는 요청 전에 거부한다', async page => {
  const request = vi.fn<typeof fetch>();
  expect(await listRecords({ ...scope, page }, { request })).toMatchObject({ ok: false, error: { kind: 'INVALID_INPUT' } });
  expect(request).not.toHaveBeenCalled();
});

test('page와 cursor를 함께 지정하면 요청 전에 거부한다', async () => {
  const request = vi.fn<typeof fetch>();
  expect(await listRecords({ ...scope, page: 1, cursor: '' }, { request })).toMatchObject({ ok: false, error: { kind: 'INVALID_INPUT' } });
  expect(request).not.toHaveBeenCalled();
});

test.each([
  { page: 0 }, { page: 1 }, { pageSize: 50 }, { totalItems: -1 }, { totalItems: 22 },
  { totalPages: 3 }, { totalPages: 2.5 }, { hasNextPage: true }, { nextCursor: null },
])('번호형 메타데이터 불일치를 거부한다: %o', async invalid => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(json({ ...numbered, pageInfo: { ...numbered.pageInfo, ...invalid } }));
  expect(await listRecords({ ...scope, page: 2 }, { request })).toMatchObject({ ok: false, error: { kind: 'INVALID_RESPONSE' } });
});

test('요청한 모드와 다른 응답을 거부한다', async () => {
  expect(await listRecords({ ...scope, page: 2 }, { request: vi.fn<typeof fetch>().mockResolvedValue(json(list)) })).toMatchObject({ ok: false, error: { kind: 'INVALID_RESPONSE' } });
  expect(await listRecords(scope, { request: vi.fn<typeof fetch>().mockResolvedValue(json(numbered)) })).toMatchObject({ ok: false, error: { kind: 'INVALID_RESPONSE' } });
});

test('초과 요청의 마지막 페이지 보정과 빈 범위를 검증한다', async () => {
  expect(await listRecords({ ...scope, page: 99 }, { request: vi.fn<typeof fetch>().mockResolvedValue(json(numbered)) })).toMatchObject({ ok: true });
  const empty = { ...list, items: [], pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasNextPage: false } };
  expect(await listRecords({ ...scope, page: 99 }, { request: vi.fn<typeof fetch>().mockResolvedValue(json(empty)) })).toMatchObject({ ok: true });
});
