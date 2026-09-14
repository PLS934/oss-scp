import { useEffect, useReducer, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { recordDetailPath, type ListColumn, type MenuItem } from './menu';
import {
  listRecords,
  type ApiResult,
  type JsonValue,
  type ListRecordsResult,
  type RecordApiError,
  type RecordListLimit,
} from './records';

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

const collectionMessages: Partial<Record<ListRecordsResult['collection']['status'], string>> = {
  running: '현재 수집이 진행 중입니다. 아래 목록은 마지막으로 저장된 데이터입니다.',
  partial: '마지막 수집이 부분 완료되었습니다. 저장된 데이터만 표시합니다.',
  failed: '마지막 수집이 실패했습니다. 마지막으로 저장된 데이터가 있으면 계속 표시합니다.',
};

interface RecordListViewProps {
  menu: MenuItem;
  limit: RecordListLimit;
  pageIndex: number;
  loading: boolean;
  result: ListRecordsResult | null;
  error: RecordApiError | null;
  onLimitChange: (limit: RecordListLimit) => void;
  onPrevious: () => void;
  onNext: () => void;
  onRetry: () => void;
}

function activateRowLink(event: MouseEvent<HTMLTableRowElement>) {
  const target = event.target;
  if (!(target instanceof Element) || target.closest('a, button, input, select, textarea')) return;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (window.getSelection()?.toString()) return;
  event.currentTarget.querySelector<HTMLAnchorElement>('a')?.click();
}

export function RecordListView({ menu, limit, pageIndex, loading, result, error, onLimitChange, onPrevious, onNext, onRetry }: RecordListViewProps) {
  const collectionMessage = result ? collectionMessages[result.collection.status] : undefined;
  const hasItems = Boolean(result?.items.length);
  const navigationDisabled = loading || error !== null;
  return <section aria-labelledby="record-list-title">
    <p className="eyebrow">{menu.group}</p>
    <div className="list-heading">
      <h2 id="record-list-title">{menu.title}</h2>
      <label>묶음 크기 <select value={limit} disabled={loading} onChange={event => onLimitChange(Number(event.target.value) as RecordListLimit)}>
        {limits.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
    </div>
    {loading ? <p role="status">저장된 목록을 불러오는 중입니다.</p> : null}
    {!loading && error ? <div className="list-message error" role="alert"><p>{error.message}</p><button type="button" onClick={onRetry}>다시 시도</button></div> : null}
    {!loading && !error && collectionMessage ? <p className={`list-message ${result?.collection.status}`} role="status">{collectionMessage}</p> : null}
    {!loading && !error && result?.collection.status === 'never_collected' && !hasItems ? <p className="empty-state">아직 수집된 데이터가 없습니다.</p> : null}
    {!loading && !error && result?.collection.status === 'success' && !hasItems ? <p className="empty-state">수집이 완료됐지만 표시할 결과가 없습니다.</p> : null}
    {!loading && !error && result && result.collection.status !== 'never_collected' && result.collection.status !== 'success' && !hasItems ? <p className="empty-state">현재 표시할 저장 데이터가 없습니다.</p> : null}
    {result && hasItems ? <div className="record-table-wrap"><table>
      <thead><tr>{menu.list.columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
      <tbody>{result.items.map(item => <tr key={item.id} className="record-row" onClick={activateRowLink}>{menu.list.columns.map((column, index) => {
        const value = formatColumnValue(column.type, item.sourceValues[column.key]);
        return <td key={column.key} aria-label={index === 0 ? value : undefined}>{index === 0
          ? <Link className="record-row-link" to={recordDetailPath(menu.path, item.id)} aria-label={`${menu.title} ${value} (${item.id}) 상세`}>{value}</Link>
          : value}</td>;
      })}</tr>)}</tbody>
    </table></div> : null}
    <nav className="pagination" aria-label="목록 페이지 탐색">
      <span>{pageIndex + 1}번째 묶음{result ? ` · ${result.items.length}개 항목` : ''}</span>
      <button type="button" disabled={navigationDisabled || pageIndex === 0} onClick={onPrevious}>이전 묶음</button>
      <button type="button" disabled={navigationDisabled || !result?.pageInfo.hasNextPage} onClick={onNext}>다음 묶음</button>
      {!loading && !error && result && !result.pageInfo.hasNextPage ? <span>마지막 묶음입니다.</span> : null}
    </nav>
  </section>;
}

export interface NavigationTarget { cursor: string | undefined; index: number }
export interface NavigationState {
  sessionKey: string;
  history: (string | undefined)[];
  index: number;
  target: NavigationTarget | null;
  requestVersion: number;
}
export type NavigationAction =
  | { type: 'reset'; sessionKey: string }
  | { type: 'next'; cursor: string }
  | { type: 'previous' }
  | { type: 'success' }
  | { type: 'failure' };

export function createNavigationState(sessionKey: string): NavigationState {
  return { sessionKey, history: [undefined], index: 0, target: null, requestVersion: 0 };
}

export function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
  if (action.type === 'reset') return createNavigationState(action.sessionKey);
  if (action.type === 'failure') return state;
  if (action.type === 'next') {
    return { ...state, target: { cursor: action.cursor, index: state.index + 1 }, requestVersion: state.requestVersion + 1 };
  }
  if (action.type === 'previous') {
    if (state.index === 0) return state;
    return { ...state, target: { cursor: state.history[state.index - 1], index: state.index - 1 }, requestVersion: state.requestVersion + 1 };
  }
  if (!state.target) return state;
  const history = state.target.index > state.index
    ? [...state.history.slice(0, state.index + 1), state.target.cursor]
    : state.history;
  return { ...state, history, index: state.target.index, target: null };
}

export function requestedCursor(state: NavigationState): string | undefined {
  return state.target ? state.target.cursor : state.history[state.index];
}

export interface RecordListProps {
  menu: MenuItem;
  request?: typeof listRecords;
}

export function RecordList({ menu, request = listRecords }: RecordListProps) {
  const [limit, setLimit] = useState<RecordListLimit>(20);
  const sessionKey = JSON.stringify([menu.pluginId, menu.sourceId, menu.dataType, limit]);
  const [navigation, dispatchNavigation] = useReducer(navigationReducer, sessionKey, createNavigationState);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ListRecordsResult | null>(null);
  const [error, setError] = useState<RecordApiError | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (navigation.sessionKey !== sessionKey) {
      dispatchNavigation({ type: 'reset', sessionKey });
      setResult(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const currentRequest = ++requestId.current;
    const cursor = requestedCursor(navigation);
    setLoading(true);
    setError(null);
    void request({ pluginId: menu.pluginId, sourceId: menu.sourceId, dataType: menu.dataType, limit, cursor }, { signal: controller.signal })
      .then((response: ApiResult<ListRecordsResult>) => {
        if (controller.signal.aborted || currentRequest !== requestId.current) return;
        if (response.ok) {
          setResult(response.data);
          dispatchNavigation({ type: 'success' });
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

  return <RecordListView menu={menu} limit={limit} pageIndex={currentSession ? navigation.index : 0} loading={busy} result={visibleResult} error={visibleError}
    onLimitChange={value => setLimit(value)}
    onPrevious={() => { if (!busy && navigation.index > 0) { setError(null); dispatchNavigation({ type: 'previous' }); } }}
    onNext={() => { if (!busy && visibleResult?.pageInfo.hasNextPage && visibleResult.pageInfo.nextCursor) { setError(null); dispatchNavigation({ type: 'next', cursor: visibleResult.pageInfo.nextCursor }); } }}
    onRetry={() => { setError(null); setRetry(value => value + 1); }} />;
}
