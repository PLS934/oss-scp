import { describe, expect, it, vi } from 'vitest';
import { getManualSyncCapability, getManualSyncRequest, scheduleManualSyncPoll, startManualSync } from '../src/manual-sync';

const response = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const request = { requestId: 'request-1', pluginId: 'sample', status: 'accepted', runId: null, startedAt: '2026-09-17T00:00:00.000Z', finishedAt: null, errorCode: null } as const;
const capability = { pluginId: 'sample', available: true, canExecute: true, reason: null, currentRun: null, lastSuccessAt: null } as const;

describe('manual sync client', () => {
  it('capability·접수·상태 응답을 검증한다', async () => {
    const fetcher = vi.fn()
      .mockImplementationOnce(() => response(200, capability))
      .mockImplementationOnce(() => response(202, request))
      .mockImplementationOnce(() => response(200, { ...request, status: 'success', runId: 'run-1', finishedAt: '2026-09-17T00:01:00.000Z' }));
    expect(await getManualSyncCapability('sample', { request: fetcher })).toEqual({ ok: true, data: capability });
    expect(await startManualSync('sample', { request: fetcher })).toEqual({ ok: true, data: request });
    expect((await getManualSyncRequest('request-1', { request: fetcher })).ok).toBe(true);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST' });
  });
  it.each([[403, 'FORBIDDEN'], [409, 'CONFLICT'], [404, 'NOT_FOUND']] as const)('%s를 안전한 %s 오류로 변환한다', async (status, kind) => {
    const result = await startManualSync('sample', { request: () => response(status, { stack: 'secret', currentRun: null }) as never });
    expect(result).toMatchObject({ ok: false, error: { kind } }); expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('잘못된 JSON·네트워크·취소를 구분한다', async () => {
    expect(await getManualSyncCapability('sample', { request: (() => response(200, { bad: true })) as never })).toMatchObject({ ok: false, error: { kind: 'INVALID_RESPONSE' } });
    expect(await getManualSyncCapability('sample', { request: (() => Promise.reject(new Error('secret'))) as never })).toMatchObject({ ok: false, error: { kind: 'NETWORK_ERROR' } });
    const controller = new AbortController(); controller.abort();
    expect(await getManualSyncCapability('sample', { signal: controller.signal })).toMatchObject({ ok: false, error: { kind: 'ABORTED' } });
  });
  it('polling은 지연 뒤 한 요청만 보내고 취소하면 늦은 결과를 폐기한다', async () => {
    vi.useFakeTimers();
    try {
      const onResult = vi.fn(); const poll = vi.fn(async () => ({ ok: true, data: request } as const));
      scheduleManualSyncPoll('request-1', 1000, onResult, poll);
      expect(poll).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1000);
      expect(poll).toHaveBeenCalledOnce(); expect(onResult).toHaveBeenCalledOnce();
      const late = vi.fn(); let resolve!: (value: { ok: true; data: typeof request }) => void; const pending = new Promise<{ ok: true; data: typeof request }>(done => { resolve = done; });
      const cancel = scheduleManualSyncPoll('request-1', 1000, late, () => pending as never);
      await vi.advanceTimersByTimeAsync(1000); cancel(); resolve({ ok: true, data: request }); await Promise.resolve();
      expect(late).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});
