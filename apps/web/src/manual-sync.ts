export type ManualSyncState = 'accepted' | 'running' | 'success' | 'partial' | 'failed';
export interface ManualSyncRequest { requestId: string; pluginId: string; status: ManualSyncState; runId: string | null; startedAt: string; finishedAt: string | null; errorCode: string | null }
export interface ManualSyncCapability { pluginId: string; available: boolean; canExecute: boolean; reason: string | null; currentRun: { requestId: string | null; runId: string | null; status: 'accepted' | 'running'; startedAt: string | null } | null; lastSuccessAt: string | null }
export type ManualSyncErrorKind = 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND' | 'INVALID_RESPONSE' | 'NETWORK_ERROR' | 'ABORTED' | 'API_ERROR';
export interface ManualSyncError { kind: ManualSyncErrorKind; message: string; currentRun?: ManualSyncCapability['currentRun'] }
export type ManualSyncResult<T> = { ok: true; data: T } | { ok: false; error: ManualSyncError };
export interface ManualSyncOptions { signal?: AbortSignal; request?: typeof fetch }

const states = new Set<ManualSyncState>(['accepted', 'running', 'success', 'partial', 'failed']);
const messages: Record<ManualSyncErrorKind, string> = { FORBIDDEN: '동기화를 실행할 권한이 없습니다.', CONFLICT: '동기화가 이미 진행 중이거나 실행할 수 없습니다.', NOT_FOUND: '동기화 대상을 찾을 수 없습니다.', INVALID_RESPONSE: '동기화 응답을 확인할 수 없습니다.', NETWORK_ERROR: '서버에 연결할 수 없습니다.', ABORTED: '요청이 취소되었습니다.', API_ERROR: '동기화 요청에 실패했습니다.' };
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const nullableTimestamp = (value: unknown): value is string | null => value === null || timestamp(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && !value.includes('\0');

function isRequest(value: unknown): value is ManualSyncRequest {
  if (!object(value) || !identifier(value.requestId) || !identifier(value.pluginId) || typeof value.status !== 'string' || !states.has(value.status as ManualSyncState)) return false;
  return (value.runId === null || identifier(value.runId)) && timestamp(value.startedAt) && nullableTimestamp(value.finishedAt) && (value.errorCode === null || typeof value.errorCode === 'string');
}
function isCurrentRun(value: unknown): value is NonNullable<ManualSyncCapability['currentRun']> { return object(value) && (value.requestId === null || identifier(value.requestId)) && (value.runId === null || identifier(value.runId)) && (value.status === 'accepted' || value.status === 'running') && (value.startedAt === null || timestamp(value.startedAt)); }
function isCapability(value: unknown): value is ManualSyncCapability { return object(value) && identifier(value.pluginId) && typeof value.available === 'boolean' && typeof value.canExecute === 'boolean' && (value.reason === null || typeof value.reason === 'string') && (value.currentRun === null || isCurrentRun(value.currentRun)) && nullableTimestamp(value.lastSuccessAt); }
function aborted(error: unknown, signal?: AbortSignal) { return signal?.aborted === true || (object(error) && error.name === 'AbortError'); }

async function json<T>(url: string, validate: (value: unknown) => value is T, options: ManualSyncOptions, init?: RequestInit): Promise<ManualSyncResult<T>> {
  if (options.signal?.aborted) return { ok: false, error: { kind: 'ABORTED', message: messages.ABORTED } };
  try {
    const response = await (options.request ?? fetch)(url, { ...init, signal: options.signal });
    let body: unknown; try { body = await response.json(); } catch { body = undefined; }
    if (!response.ok) {
      const kind: ManualSyncErrorKind = response.status === 403 ? 'FORBIDDEN' : response.status === 409 ? 'CONFLICT' : response.status === 404 ? 'NOT_FOUND' : 'API_ERROR';
      return { ok: false, error: { kind, message: messages[kind], ...(object(body) && isCurrentRun(body.currentRun) ? { currentRun: body.currentRun } : {}) } };
    }
    return validate(body) ? { ok: true, data: body } : { ok: false, error: { kind: 'INVALID_RESPONSE', message: messages.INVALID_RESPONSE } };
  } catch (error) { const kind = aborted(error, options.signal) ? 'ABORTED' : 'NETWORK_ERROR'; return { ok: false, error: { kind, message: messages[kind] } }; }
}

export const getManualSyncCapability = (pluginId: string, options: ManualSyncOptions = {}) => identifier(pluginId) ? json(`/api/v1/plugins/${encodeURIComponent(pluginId)}/sync`, isCapability, options) : Promise.resolve({ ok: false, error: { kind: 'NOT_FOUND', message: messages.NOT_FOUND } } as const);
export const startManualSync = (pluginId: string, options: ManualSyncOptions = {}) => identifier(pluginId) ? json(`/api/v1/plugins/${encodeURIComponent(pluginId)}/sync-runs`, isRequest, options, { method: 'POST' }) : Promise.resolve({ ok: false, error: { kind: 'NOT_FOUND', message: messages.NOT_FOUND } } as const);
export const getManualSyncRequest = (requestId: string, options: ManualSyncOptions = {}) => identifier(requestId) ? json(`/api/v1/sync-runs/${encodeURIComponent(requestId)}`, isRequest, options) : Promise.resolve({ ok: false, error: { kind: 'NOT_FOUND', message: messages.NOT_FOUND } } as const);

export function scheduleManualSyncPoll(requestId: string, delayMs: number, onResult: (result: ManualSyncResult<ManualSyncRequest>) => void, request = getManualSyncRequest): () => void {
  const controller = new AbortController();
  const timer = setTimeout(() => { void request(requestId, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) onResult(result); }); }, delayMs);
  return () => { clearTimeout(timer); controller.abort(); };
}
