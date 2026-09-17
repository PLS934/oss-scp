import { RecordFilterHeader, RecordSearchToolbar, useRecordSearchState, type RecordSearchState } from './record-search';
import type { SearchConditions } from './records';
import { useEffect, useReducer, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { recordDetailPath, type ListColumn, type MenuItem } from './menu';
import {
  listNumberedRecords,
  type ApiResult,
  type JsonValue,
  type NumberedListRecordsResult,
  type RecordApiError,
  type RecordListLimit,
  type RecordSort,
} from './records';
import { getManualSyncCapability, getManualSyncRequest, scheduleManualSyncPoll, startManualSync, type ManualSyncCapability, type ManualSyncError, type ManualSyncRequest } from './manual-sync';

const limits: readonly RecordListLimit[] = [20, 50, 100, 200];
const numberFormat = new Intl.NumberFormat('ko-KR');
const dateTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

export function formatColumnValue(type: ListColumn['type'], value: JsonValue | undefined): string {
  if (value === null || value === undefined) return '—';
  if (type === 'string') return typeof value === 'string' ? value : '—';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value) ? numberFormat.format(value) : '—';
  if (type === 'boolean') return typeof value === 'boolean' ? (value ? '예' : '아니요') : '—';
  if (typeof value !== 'string') return '—';
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? '—' : dateTimeFormat.format(new Date(timestamp));
}

const collectionMessages: Partial<Record<'never_collected' | 'running' | 'success' | 'partial' | 'failed', string>> = {
  running: '현재 수집이 진행 중입니다. 아래 목록은 마지막으로 저장된 데이터입니다.',
  partial: '마지막 수집이 부분 완료되었습니다. 저장된 데이터만 표시합니다.',
  failed: '마지막 수집이 실패했습니다. 마지막으로 저장된 데이터가 있으면 계속 표시합니다.',
};

interface RecordListViewProps {
  menu: MenuItem;
  title?: string;
  loadingMessage?: string;
  renderItems?: (result: NumberedListRecordsResult) => ReactNode;
  limit: RecordListLimit;
  page: number;
  loading: boolean;
  result: NumberedListRecordsResult | null;
  error: RecordApiError | null;
  onLimitChange: (limit: RecordListLimit) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  searchControls?: ReactNode;
  searchState?: RecordSearchState;
  activeConditions?: boolean;
  sort?: RecordSort;
  onSortChange?: (sort: RecordSort | undefined) => void;
  syncCapability?: ManualSyncCapability | null;
  syncRequest?: ManualSyncRequest | null;
  syncError?: ManualSyncError | null;
  syncBusy?: boolean;
  onSync?: () => void;
}

export function nextRecordSort(current: RecordSort | undefined, field: string): RecordSort | undefined {
  if (!current || current.field !== field) return { field, direction: 'asc' };
  if (current.direction === 'asc') return { field, direction: 'desc' };
  return undefined;
}

function activateRowLink(event: MouseEvent<HTMLTableRowElement>) {
  const target = event.target;
  if (!(target instanceof Element) || target.closest('a, button, input, select, textarea')) return;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (window.getSelection()?.toString()) return;
  event.currentTarget.querySelector<HTMLAnchorElement>('a')?.click();
}

export function RecordListView({ menu, title, loadingMessage, renderItems, limit, page, loading, result, error, onLimitChange, onPageChange, onRetry, searchControls, searchState, activeConditions = false, sort, onSortChange, syncCapability = null, syncRequest = null, syncError = null, syncBusy = false, onSync }: RecordListViewProps) {
  const stored = result && !('mode' in result) ? result : null;
  const collectionMessage = stored ? collectionMessages[stored.collection.status] : undefined;
  const hasItems = Boolean(result?.items.length);
  const navigationDisabled = loading || error !== null || !result || result.pageInfo.totalPages === 0;
  const totalPages = result?.pageInfo.totalPages ?? 0;
  return <section aria-labelledby="record-list-title">
    <p className="eyebrow">{menu.group}</p>
    <div className="list-heading">
      <h2 id="record-list-title">{title ?? menu.title}</h2>

    </div>
    <div className="sync-panel">
      <div><strong>플러그인 전체 동기화</strong><p>이 플러그인의 활성화된 수집 대상 전체를 동기화합니다.</p></div>
      <button type="button" onClick={onSync} disabled={syncBusy || !syncCapability?.canExecute}>{syncBusy ? '동기화 중' : '지금 동기화'}</button>
    </div>
    {syncCapability && !syncCapability.canExecute && syncCapability.reason === 'NO_ACTIVE_TARGETS' ? <p className="list-message">활성화된 수집 대상이 없습니다.</p> : null}
    {syncError && syncError.kind !== 'ABORTED' ? <p className="list-message error" role="alert">{syncError.message}</p> : null}
    {syncRequest?.status === 'success' ? <p className="list-message success" role="status">동기화가 완료되었습니다.</p> : null}
    {syncRequest?.status === 'partial' ? <p className="list-message partial" role="status">동기화가 부분 완료되었습니다.</p> : null}
    {syncRequest?.status === 'failed' ? <p className="list-message failed" role="alert">동기화에 실패했습니다. 기존 저장 데이터는 유지됩니다.</p> : null}
    {syncCapability?.lastSuccessAt ? <p>마지막 성공: {dateTimeFormat.format(new Date(syncCapability.lastSuccessAt))}</p> : null}
    {searchState ? <RecordSearchToolbar state={searchState} /> : searchControls}
    {renderItems && searchState && menu.list.query?.filters.length ? <div className="record-card-filters" aria-label="필터">{menu.list.query.filters.map(field => <RecordFilterHeader key={field.key} field={field} state={searchState} />)}</div> : null}
    {loading ? <p role="status">{loadingMessage ?? '저장된 목록을 불러오는 중입니다.'}</p> : null}
    {!loading && error ? <div className="list-message error" role="alert"><p>{error.message}</p><button type="button" onClick={onRetry}>다시 시도</button></div> : null}
    {!loading && !error && result && 'mode' in result ? <p className="list-message success" role="status">원천 PostgreSQL을 실시간으로 조회했습니다.</p> : null}
    {!loading && !error && collectionMessage ? <p className={`list-message ${stored?.collection.status}`} role="status">{collectionMessage}</p> : null}
    {!loading && !error && result && activeConditions && !hasItems ? <p className="empty-state">검색·필터 결과가 없습니다.</p> : null}
    {!loading && !error && stored?.collection.status === 'never_collected' && !hasItems ? <p className="empty-state">아직 수집된 데이터가 없습니다.</p> : null}
    {!loading && !error && !activeConditions && stored?.collection.status === 'success' && !hasItems ? <p className="empty-state">수집이 완료됐지만 표시할 결과가 없습니다.</p> : null}
    {!loading && !error && !activeConditions && stored && stored.collection.status !== 'never_collected' && stored.collection.status !== 'success' && !hasItems ? <p className="empty-state">현재 표시할 저장 데이터가 없습니다.</p> : null}
    <div className="record-table-toolbar">
      <div className="record-list-summary"><p className="record-total" aria-live="polite">전체 {numberFormat.format(result?.pageInfo.totalItems ?? 0)}건</p>{menu.list.sorts?.length ? <div className="sort-chips" aria-label="정렬 기준">{menu.list.sorts.map(field => {
        const direction = sort?.field === field.key ? sort.direction : undefined;
        const state = direction === 'asc' ? '오름차순' : direction === 'desc' ? '내림차순' : '해제';
        return <button key={field.key} type="button" className={`sort-chip${direction ? ' active' : ''}`} aria-label={`${field.label} 정렬: ${state}`} aria-pressed={Boolean(direction)} onClick={() => onSortChange?.(nextRecordSort(sort, field.key))}><span>{field.label}</span>{direction ? <svg aria-hidden="true" viewBox="0 0 16 16"><path d={direction === 'asc' ? 'm4 10 4-4 4 4' : 'm4 6 4 4 4-4'} /></svg> : null}</button>;
      })}</div> : null}</div>
      <label className="page-size-select"><select aria-label="페이지 크기" value={limit} disabled={loading} onChange={event => onLimitChange(Number(event.target.value) as RecordListLimit)}>
        {limits.map(value => <option key={value} value={value}>{value}개씩 보기</option>)}
      </select><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m7 10 5 5 5-5" /></svg></label>
    </div>
    {renderItems ? result && hasItems ? renderItems(result) : null : result || searchState ? <div className="record-table-wrap"><table>
      <thead><tr>{menu.list.columns.map(column => {
        const filter = menu.list.query?.filters.find(candidate => candidate.key === column.key);
        return <th key={column.key} scope="col">{filter && searchState ? <RecordFilterHeader field={filter} state={searchState} /> : column.label}</th>;
      })}</tr></thead>
      <tbody>{(result?.items ?? []).map(item => <tr key={item.id} className="record-row" onClick={activateRowLink}>{menu.list.columns.map((column, index) => {
        const value = formatColumnValue(column.type, item.sourceValues[column.key]);
        return <td key={column.key} aria-label={index === 0 ? value : undefined}>{index === 0
          ? <Link className="record-row-link" to={recordDetailPath(menu.path, item.id)} aria-label={`${menu.title} ${value} (${item.id}) 상세`}>{value}</Link>
          : value}</td>;
      })}</tr>)}</tbody>
    </table></div> : null}
    <nav className="pagination" aria-label="목록 페이지 탐색">
      <div className="pagination-controls">
      <button type="button" aria-label="첫 페이지" disabled={navigationDisabled || page <= 1} onClick={() => onPageChange(1)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m11 5-7 7 7 7m9-14-7 7 7 7" /></svg></button>
      <button type="button" aria-label="이전 페이지" disabled={navigationDisabled || page <= 1} onClick={() => onPageChange(page - 1)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg></button>
      {pageNumbers(page, totalPages).map(number => <button key={number} type="button" aria-label={`${number}페이지`} aria-current={page === number ? 'page' : undefined} disabled={navigationDisabled} onClick={() => onPageChange(number)}>{number}</button>)}
      <button type="button" aria-label="다음 페이지" disabled={navigationDisabled || page >= totalPages} onClick={() => onPageChange(page + 1)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg></button>
      <button type="button" aria-label="마지막 페이지" disabled={navigationDisabled || page >= totalPages} onClick={() => onPageChange(totalPages)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m4 5 7 7-7 7m9-14 7 7-7 7" /></svg></button>
      </div>
    </nav>
  </section>;
}

export function pageNumbers(page: number, totalPages: number): number[] {
  const first = Math.floor((page - 1) / 10) * 10 + 1;
  return Array.from({ length: Math.max(0, Math.min(10, totalPages - first + 1)) }, (_, index) => first + index);
}

export interface NavigationState {
  sessionKey: string;
  page: number;
  target: number | null;
  requestVersion: number;
}
export type NavigationAction =
  | { type: 'reset'; sessionKey: string }
  | { type: 'navigate'; page: number }
  | { type: 'success'; page: number }
  | { type: 'failure' };

export function createNavigationState(sessionKey: string): NavigationState {
  return { sessionKey, page: 1, target: null, requestVersion: 0 };
}

export function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
  if (action.type === 'reset') return createNavigationState(action.sessionKey);
  if (action.type === 'failure') return state;
  if (action.type === 'navigate') {
    if (!Number.isSafeInteger(action.page) || action.page < 1) return state;
    return { ...state, target: action.page, requestVersion: state.requestVersion + 1 };
  }
  return { ...state, page: action.page, target: null };
}

export interface RecordListProps {
  menu: MenuItem;
  request?: typeof listNumberedRecords;
  title?: string;
  loadingMessage?: string;
  renderItems?: (result: NumberedListRecordsResult) => ReactNode;
  capabilityRequest?: typeof getManualSyncCapability;
  startSyncRequest?: typeof startManualSync;
  syncStatusRequest?: typeof getManualSyncRequest;
  pollIntervalMs?: number;
}

export function RecordList(props: RecordListProps) {
  const { menu } = props;
  return <RecordListSession key={JSON.stringify([menu.path, menu.pluginId, menu.sourceId, menu.dataType, menu.list.query, menu.list.sorts])} {...props} />;
}
function RecordListSession({ menu, request = listNumberedRecords, title, loadingMessage, renderItems, capabilityRequest = getManualSyncCapability, startSyncRequest = startManualSync, syncStatusRequest = getManualSyncRequest, pollIntervalMs = 1000 }: RecordListProps) {
  const [conditions, setConditions] = useState<SearchConditions>({});
  const [conditionVersion, setConditionVersion] = useState(0);
  const [limit, setLimit] = useState<RecordListLimit>(20);
  const [sort, setSort] = useState<RecordSort | undefined>();
  const applyConditions = (value: SearchConditions) => { setConditions(value); setConditionVersion(version => version + 1); };
  const searchState = useRecordSearchState(menu.list.query ?? { searchEnabled: false, filters: [] }, applyConditions);
  const sessionKey = JSON.stringify([menu.path, menu.pluginId, menu.sourceId, menu.dataType, limit, conditions, conditionVersion, sort]);
  const [navigation, dispatchNavigation] = useReducer(navigationReducer, sessionKey, createNavigationState);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<NumberedListRecordsResult | null>(null);
  const [error, setError] = useState<RecordApiError | null>(null);
  const requestId = useRef(0);
  const [syncCapability, setSyncCapability] = useState<ManualSyncCapability | null>(null);
  const [syncRequest, setSyncRequest] = useState<ManualSyncRequest | null>(null);
  const [syncError, setSyncError] = useState<ManualSyncError | null>(null);
  const [syncSubmitting, setSyncSubmitting] = useState(false);
  const [syncRefresh, setSyncRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController(); setSyncCapability(null); setSyncRequest(null); setSyncError(null);
    void capabilityRequest(menu.pluginId, { signal: controller.signal }).then(response => {
      if (controller.signal.aborted) return;
      if (response.ok) setSyncCapability(response.data); else if (response.error.kind !== 'ABORTED') setSyncError(response.error);
    });
    return () => controller.abort();
  }, [capabilityRequest, menu.pluginId, syncRefresh]);

  useEffect(() => {
    if (!syncRequest || (syncRequest.status !== 'accepted' && syncRequest.status !== 'running')) return;
    return scheduleManualSyncPoll(syncRequest.requestId, pollIntervalMs, response => {
      if (response.ok) {
        setSyncRequest(response.data);
        if (!['accepted', 'running'].includes(response.data.status)) {
          dispatchNavigation({ type: 'reset', sessionKey }); setResult(null); setRetry(value => value + 1); setSyncRefresh(value => value + 1);
        }
      } else if (response.error.kind !== 'ABORTED') setSyncError(response.error);
    }, syncStatusRequest);
  }, [pollIntervalMs, sessionKey, syncRequest, syncStatusRequest]);

  const beginSync = () => {
    if (syncSubmitting || !syncCapability?.canExecute) return;
    setSyncSubmitting(true); setSyncError(null);
    void startSyncRequest(menu.pluginId).then(response => {
      setSyncSubmitting(false);
      if (response.ok) { setSyncRequest(response.data); setSyncCapability(value => value ? { ...value, canExecute: false, reason: 'SYNC_ALREADY_RUNNING' } : value); }
      else {
        setSyncError(response.error);
        const currentRun = 'currentRun' in response.error ? response.error.currentRun : undefined;
        if (currentRun?.requestId) setSyncRequest({ requestId: currentRun.requestId, pluginId: menu.pluginId, status: currentRun.status, runId: currentRun.runId, startedAt: currentRun.startedAt ?? new Date().toISOString(), finishedAt: null, errorCode: null });
      }
    });
  };

  useEffect(() => {
    if (navigation.sessionKey !== sessionKey) {
      dispatchNavigation({ type: 'reset', sessionKey });
      setResult(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const currentRequest = ++requestId.current;
    const page = navigation.target ?? navigation.page;
    setLoading(true);
    setError(null);
    void request({ pluginId: menu.pluginId, sourceId: menu.sourceId, dataType: menu.dataType, limit, page, ...conditions, ...(sort ? { sort } : {}) }, { signal: controller.signal })
      .then((response: ApiResult<NumberedListRecordsResult>) => {
        if (controller.signal.aborted || currentRequest !== requestId.current) return;
        if (response.ok) {
          setResult(response.data);
          dispatchNavigation({ type: 'success', page: response.data.pageInfo.page });
        } else if (response.error.kind !== 'ABORTED') {
          setError(response.error);
          dispatchNavigation({ type: 'failure' });
        }
        setLoading(false);
      });
    return () => { controller.abort(); requestId.current += 1; };
  }, [limit, menu.dataType, menu.pluginId, menu.sourceId, navigation.requestVersion, navigation.sessionKey, request, retry, sessionKey]);

  const currentSession = navigation.sessionKey === sessionKey;
  const visibleResult = currentSession ? result : null;
  const visibleError = currentSession ? error : null;
  const busy = !currentSession || loading || (navigation.target !== null && visibleError === null);

  return <RecordListView searchState={menu.list.query && (menu.list.query.searchEnabled || menu.list.query.filters.length > 0) ? searchState : undefined} menu={menu} title={title} loadingMessage={loadingMessage} renderItems={renderItems} activeConditions={Boolean(conditions.q || conditions.filters?.length)} sort={sort} onSortChange={setSort} limit={limit} page={currentSession ? navigation.page : 1} loading={busy} result={visibleResult} error={visibleError}
    onLimitChange={value => setLimit(value)}
    onPageChange={page => {
      if (!busy && visibleResult && page >= 1 && page <= visibleResult.pageInfo.totalPages && page !== navigation.page) {
        setError(null); dispatchNavigation({ type: 'navigate', page });
      }
    }}
    onRetry={() => { setError(null); setRetry(value => value + 1); }} syncCapability={syncCapability} syncRequest={syncRequest} syncError={syncError}
    syncBusy={syncSubmitting || syncRequest?.status === 'accepted' || syncRequest?.status === 'running'} onSync={beginSync} />;
}
