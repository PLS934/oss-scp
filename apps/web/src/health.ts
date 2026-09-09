export type ConnectionState = 'loading' | 'success' | 'failure';

// 취소된 effect의 응답은 화면 상태를 갱신하지 않는다.
export function observeHealth(
  onResult: (state: ConnectionState) => void,
  request: typeof fetch = fetch,
): () => void {
  const controller = new AbortController();
  let active = true;
  const finish = (state: ConnectionState) => {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    onResult(state);
  };
  const timer = setTimeout(() => {
    finish('failure');
    controller.abort();
  }, 5000);

  void (async () => {
    try {
      const response = await request('/api/v1/health', { signal: controller.signal });
      const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (response.status !== 200 || contentType !== 'application/json') throw new Error('응답 계약 오류');
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body) || !('status' in body) || body.status !== 'ok') {
        throw new Error('상태 계약 오류');
      }
      finish('success');
    } catch {
      finish('failure');
    }
  })();

  return () => {
    active = false;
    clearTimeout(timer);
    controller.abort();
  };
}
