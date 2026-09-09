import { afterEach, expect, test, vi } from 'vitest';
import { observeHealth } from '../src/health';

afterEach(() => vi.useRealTimers());

test.each([
  [200, 'application/json; charset=utf-8', '{"status":"ok"}', 'success'],
  [201, 'application/json', '{"status":"ok"}', 'failure'],
  [503, 'application/json', '{"status":"ok"}', 'failure'],
  [200, 'text/html', '{"status":"ok"}', 'failure'],
  [200, 'application/json', 'invalid', 'failure'],
  [200, 'application/json', '{"status":"down"}', 'failure'],
  [200, 'application/json', 'null', 'failure'],
  [200, 'application/json', '[]', 'failure'],
])('응답 %s %s %s → %s', async (status, type, body, expected) => {
  const result = vi.fn();
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status, headers: { 'content-type': type } }));
  const stop = observeHealth(result, request);
  await vi.waitFor(() => expect(result).toHaveBeenCalledWith(expected));
  expect(request.mock.calls[0][0]).toBe('/api/v1/health');
  stop();
});

test('네트워크 실패', async () => {
  const result = vi.fn();
  observeHealth(result, vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')));
  await vi.waitFor(() => expect(result).toHaveBeenCalledWith('failure'));
});

test('무응답은 5초에 실패하고 늦은 성공은 무시한다', async () => {
  vi.useFakeTimers();
  let resolve!: (value: Response) => void;
  const request = vi.fn<typeof fetch>(() => new Promise(r => { resolve = r; }));
  const result = vi.fn();
  observeHealth(result, request);
  await vi.advanceTimersByTimeAsync(4999);
  expect(result).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(result).toHaveBeenCalledExactlyOnceWith('failure');
  expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
  resolve(Response.json({ status: 'ok' }));
  await vi.advanceTimersByTimeAsync(1);
  expect(result).toHaveBeenCalledTimes(1);
});

test('effect 정리 후 응답은 상태를 덮어쓰지 않는다', async () => {
  vi.useFakeTimers();
  let resolve!: (value: Response) => void;
  const result = vi.fn();
  const stop = observeHealth(result, () => new Promise(r => { resolve = r; }));
  stop();
  resolve(Response.json({ status: 'ok' }));
  await vi.advanceTimersByTimeAsync(6000);
  expect(result).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
