import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DetailField, MenuItem } from './menu';
import { getLiveRecord, getRecord, type JsonValue, type LiveRecord, type QueryRecord, type RecordApiError } from './records';

function JsonValueView({ value }: { value: JsonValue }): ReactNode {
  if (value === null) return <span className="empty-value">값 없음</span>;
  if (typeof value === 'boolean') return value ? '예' : '아니요';
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="empty-value">항목 없음</span>;
    return <ol className="array-values">{value.map((item, index) => <li key={index}><JsonValueView value={item} /></li>)}</ol>;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return <span className="empty-value">항목 없음</span>;
  return <dl className="nested-fields">{entries.map(([key, item]) => <div key={key}><dt>{key}</dt><dd><JsonValueView value={item} /></dd></div>)}</dl>;
}

export function DetailValue({ field, value, present = true }: { field: DetailField; value: JsonValue | undefined; present?: boolean }): ReactNode {
  if (!present || value === undefined) return <span className="empty-value">필드 누락</span>;
  if (value === null) return <span className="empty-value">값 없음</span>;
  if (field.type === 'string') return typeof value === 'string' ? value : <span className="invalid-value">표시할 수 없는 값</span>;
  if (field.type === 'number') return typeof value === 'number' ? String(value) : <span className="invalid-value">표시할 수 없는 값</span>;
  if (field.type === 'boolean') return typeof value === 'boolean' ? (value ? '예' : '아니요') : <span className="invalid-value">표시할 수 없는 값</span>;
  if (field.type === 'datetime') {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return <span className="invalid-value">표시할 수 없는 값</span>;
    return <time dateTime={value}>{new Date(value).toLocaleString('ko-KR')}</time>;
  }
  if (field.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) return <span className="invalid-value">표시할 수 없는 값</span>;
  if (field.type === 'array' && !Array.isArray(value)) return <span className="invalid-value">표시할 수 없는 값</span>;
  return <JsonValueView value={value} />;
}

export function DetailContent({ menu, record }: { menu: MenuItem; record: QueryRecord | LiveRecord }) {
  return <section aria-labelledby="detail-title"><p className="eyebrow">{menu.group}</p><h2 id="detail-title">{menu.title} 상세</h2>
    {menu.detail.sections.map(section => <section className="detail-section" key={section.title}><h3>{section.title}</h3><dl>{section.fields.map(field => {
      const present = Object.prototype.hasOwnProperty.call(record.sourceValues, field.key);
      return <div key={field.key}><dt>{field.label}</dt><dd><DetailValue field={field} value={record.sourceValues[field.key]} present={present} /></dd></div>;
    })}</dl></section>)}
    <Link className="back-link" to={menu.path}>목록으로 돌아가기</Link>
  </section>;
}

type State = { kind: 'loading' } | { kind: 'success'; record: QueryRecord | LiveRecord } | { kind: 'invalid' | 'missing' | 'mismatch' | 'failure'; error?: RecordApiError };

export function RecordDetail({ menu, recordId, request }: { menu: MenuItem; recordId: string; request?: typeof fetch }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    const load = menu.sourceMode === 'live'
      ? getLiveRecord({ pluginId: menu.pluginId, sourceId: menu.sourceId, dataType: menu.dataType, externalKey: recordId }, { signal: controller.signal, request })
      : getRecord(recordId, { signal: controller.signal, request });
    void load.then(result => {
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setState({ kind: result.error.kind === 'INVALID_INPUT' ? 'invalid' : result.error.kind === 'NOT_FOUND' ? 'missing' : 'failure', error: result.error });
        return;
      }
      const record = result.data;
      setState(record.pluginId === menu.pluginId && record.sourceId === menu.sourceId && record.dataType === menu.dataType ? { kind: 'success', record } : { kind: 'mismatch' });
    });
    return () => controller.abort();
  }, [attempt, menu.dataType, menu.pluginId, menu.sourceId, recordId, request]);

  if (state.kind === 'success') return <DetailContent menu={menu} record={state.record} />;
  const message = state.kind === 'loading' ? '상세 정보를 불러오는 중입니다.' : state.kind === 'invalid' ? '잘못된 레코드 ID입니다.' : state.kind === 'missing' ? '저장 레코드를 찾을 수 없습니다.' : state.kind === 'mismatch' ? '현재 플러그인에 속한 레코드가 아닙니다.' : '상세 정보를 불러오지 못했습니다.';
  return <section aria-labelledby="detail-state-title"><h2 id="detail-state-title">{message}</h2>
    {state.kind === 'failure' ? <button type="button" onClick={() => setAttempt(value => value + 1)}>다시 시도</button> : null}
    {state.kind !== 'loading' ? <p><Link to={menu.path}>목록으로 돌아가기</Link></p> : null}
  </section>;
}
