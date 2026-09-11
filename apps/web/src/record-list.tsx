import { useEffect, useRef, useState } from 'react';
import type { ListColumn, MenuItem } from './menu';
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
  loading: boolean;
  result: ListRecordsResult | null;
  error: RecordApiError | null;
  onLimitChange: (limit: RecordListLimit) => void;
  onNext: () => void;
  onRetry: () => void;
}

export function RecordListView({ menu, limit, loading, result, error, onLimitChange, onNext, onRetry }: RecordListViewProps) {
  const collectionMessage = result ? collectionMessages[result.collection.status] : undefined;
  const hasItems = Boolean(result?.items.length);
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
    {!loading && !error && result && hasItems ? <div className="record-table-wrap"><table>
      <thead><tr>{menu.list.columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
      <tbody>{result.items.map(item => <tr key={item.id}>{menu.list.columns.map(column => <td key={column.key}>{formatColumnValue(column.type, item.sourceValues[column.key])}</td>)}</tr>)}</tbody>
    </table></div> : null}
    {!loading && !error && result && hasItems ? <div className="pagination">
      <span>{result.items.length}개 항목</span>
      {result.pageInfo.hasNextPage ? <button type="button" onClick={onNext}>다음 묶음</button> : <span>마지막 묶음입니다.</span>}
    </div> : null}
  </section>;
}

export interface RecordListProps {
  menu: MenuItem;
  request?: typeof listRecords;
}

export function RecordList({ menu, request = listRecords }: RecordListProps) {
  const [limit, setLimit] = useState<RecordListLimit>(20);
  const [cursor, setCursor] = useState<string | undefined>();
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ListRecordsResult | null>(null);
  const [error, setError] = useState<RecordApiError | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const currentRequest = ++requestId.current;
    setLoading(true);
    setResult(null);
    setError(null);
    void request({ pluginId: menu.pluginId, sourceId: menu.sourceId, dataType: menu.dataType, limit, cursor }, { signal: controller.signal })
      .then((response: ApiResult<ListRecordsResult>) => {
        if (controller.signal.aborted || currentRequest !== requestId.current) return;
        if (response.ok) setResult(response.data);
        else if (response.error.kind !== 'ABORTED') setError(response.error);
        setLoading(false);
      });
    return () => { controller.abort(); requestId.current += 1; };
  }, [cursor, limit, menu.dataType, menu.pluginId, menu.sourceId, request, retry]);

  return <RecordListView menu={menu} limit={limit} loading={loading} result={result} error={error}
    onLimitChange={value => { setCursor(undefined); setLimit(value); }}
    onNext={() => { if (!loading && result?.pageInfo.hasNextPage && result.pageInfo.nextCursor) setCursor(result.pageInfo.nextCursor); }}
    onRetry={() => setRetry(value => value + 1)} />;
}
