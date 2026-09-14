import { useEffect, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { recordDetailPath, type ListColumn, type MenuItem } from './menu';
import {
  listNumberedRecords,
  type ApiResult,
  type JsonValue,
  type NumberedListRecordsResult,
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

const collectionMessages: Partial<Record<NumberedListRecordsResult['collection']['status'], string>> = {
  running: '현재 수집이 진행 중입니다. 아래 목록은 마지막으로 저장된 데이터입니다.',
  partial: '마지막 수집이 부분 완료되었습니다. 저장된 데이터만 표시합니다.',
  failed: '마지막 수집이 실패했습니다. 마지막으로 저장된 데이터가 있으면 계속 표시합니다.',
};

interface RecordListViewProps {
  menu: MenuItem;
  limit: RecordListLimit;
  page: number;
  loading: boolean;
  result: NumberedListRecordsResult | null;
  error: RecordApiError | null;
  onLimitChange: (limit: RecordListLimit) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}

export function RecordListView({ menu, limit, page, loading, result, error, onLimitChange, onPageChange, onRetry }: RecordListViewProps) {
  const collectionMessage = result ? collectionMessages[result.collection.status] : undefined;
  const hasItems = Boolean(result?.items.length);
  const navigationDisabled = loading || error !== null || !result || result.pageInfo.totalPages === 0;
  const totalPages = result?.pageInfo.totalPages ?? 0;
  return <section aria-labelledby="record-list-title">
    <p className="eyebrow">{menu.group}</p>
    <div className="list-heading">
      <h2 id="record-list-title">{menu.title}</h2>

    </div>
    {loading ? <p role="status">저장된 목록을 불러오는 중입니다.</p> : null}
    {!loading && error ? <div className="list-message error" role="alert"><p>{error.message}</p><button type="button" onClick={onRetry}>다시 시도</button></div> : null}
    {!loading && !error && collectionMessage ? <p className={`list-message ${result?.collection.status}`} role="status">{collectionMessage}</p> : null}
    {!loading && !error && result?.collection.status === 'never_collected' && !hasItems ? <p className="empty-state">아직 수집된 데이터가 없습니다.</p> : null}
    {!loading && !error && result?.collection.status === 'success' && !hasItems ? <p className="empty-state">수집이 완료됐지만 표시할 결과가 없습니다.</p> : null}
    {!loading && !error && result && result.collection.status !== 'never_collected' && result.collection.status !== 'success' && !hasItems ? <p className="empty-state">현재 표시할 저장 데이터가 없습니다.</p> : null}
    <div className="record-table-toolbar">
      <p className="record-total" aria-live="polite">전체 {numberFormat.format(result?.pageInfo.totalItems ?? 0)}건</p>
      <label className="page-size-select"><select aria-label="페이지 크기" value={limit} disabled={loading} onChange={event => onLimitChange(Number(event.target.value) as RecordListLimit)}>
        {limits.map(value => <option key={value} value={value}>{value}개씩 보기</option>)}
      </select><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m7 10 5 5 5-5" /></svg></label>
    </div>
    {result && hasItems ? <div className="record-table-wrap"><table>
      <thead><tr>{menu.list.columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}<th scope="col">상세</th></tr></thead>
      <tbody>{result.items.map(item => <tr key={item.id}>{menu.list.columns.map(column => <td key={column.key}>{formatColumnValue(column.type, item.sourceValues[column.key])}</td>)}<td><Link to={recordDetailPath(menu.path, item.id)}>보기</Link></td></tr>)}</tbody>
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
}

export function RecordList({ menu, request = listNumberedRecords }: RecordListProps) {
  const [limit, setLimit] = useState<RecordListLimit>(20);
  const sessionKey = JSON.stringify([menu.path, menu.pluginId, menu.sourceId, menu.dataType, limit]);
  const [navigation, dispatchNavigation] = useReducer(navigationReducer, sessionKey, createNavigationState);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<NumberedListRecordsResult | null>(null);
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
    const page = navigation.target ?? navigation.page;
    setLoading(true);
    setError(null);
    void request({ pluginId: menu.pluginId, sourceId: menu.sourceId, dataType: menu.dataType, limit, page }, { signal: controller.signal })
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

  return <RecordListView menu={menu} limit={limit} page={currentSession ? navigation.page : 1} loading={busy} result={visibleResult} error={visibleError}
    onLimitChange={value => setLimit(value)}
    onPageChange={page => {
      if (!busy && visibleResult && page >= 1 && page <= visibleResult.pageInfo.totalPages && page !== navigation.page) {
        setError(null); dispatchNavigation({ type: 'navigate', page });
      }
    }}
    onRetry={() => { setError(null); setRetry(value => value + 1); }} />;
}
