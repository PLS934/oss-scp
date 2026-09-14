import { useState, type FormEvent } from 'react';
import type { ListQuery } from './menu';
import type { RecordFilter, SearchConditions } from './records';

export type FilterDraft = Record<string, string | string[] | undefined>;
export const filterDraftKey = (field: string, part = 'value'): string => JSON.stringify([field, part]);
export function buildSearchConditions(query: ListQuery, q: string, draft: FilterDraft): SearchConditions {
  if ([...q].length > 200) throw new Error('검색어는 200자 이내로 입력해 주세요.');
  const filters: RecordFilter[] = [];
  for (const field of query.filters) {
    if (field.kind === 'select' || field.kind === 'multiSelect') {
      const selected = draft[filterDraftKey(field.key)] ?? (field.kind === 'select' ? '' : []);
      const indices = Array.isArray(selected) ? selected : selected === '' ? [] : [selected];
      const values = indices.map(index => {
        const option = field.options?.[Number(index)];
        if (!option) throw new Error('선택값을 확인해 주세요.');
        return option.value;
      });
      if (values.length) filters.push(field.kind === 'select' ? { field: field.key, kind: 'select', value: values[0]! } : { field: field.key, kind: 'multiSelect', values });
    } else {
      const start = String(draft[filterDraftKey(field.key, 'start')] ?? '');
      const end = String(draft[filterDraftKey(field.key, 'end')] ?? '');
      if (!start && !end) continue;
      if (field.kind === 'numberRange') {
        const min = start ? Number(start) : undefined;
        const max = end ? Number(end) : undefined;
        if ((min !== undefined && !Number.isFinite(min)) || (max !== undefined && !Number.isFinite(max)) || (min !== undefined && max !== undefined && min > max)) throw new Error(`${field.label} 범위를 확인해 주세요.`);
        filters.push({ field: field.key, kind: 'numberRange', ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) });
      } else {
        for (const value of [start, end]) {
          if (!value) continue;
          const date = new Date(`${value}T00:00:00Z`);
          if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${field.label} 날짜를 확인해 주세요.`);
        }
        if (start && end && start > end) throw new Error(`${field.label} 시작일은 종료일보다 늦을 수 없습니다.`);
        filters.push({ field: field.key, kind: 'dateRange', ...(start ? { from: start } : {}), ...(end ? { to: end } : {}) });
      }
    }
  }
  return { ...(query.searchEnabled && q.trim() ? { q: q.trim() } : {}), ...(filters.length ? { filters } : {}) };
}

export function RecordSearch({ query, onApply, resetVersion = 0 }: { query: ListQuery; onApply: (conditions: SearchConditions) => void; resetVersion?: number }) {
  return <SearchForm key={resetVersion} query={query} onApply={onApply} />;
}
function SearchForm({ query, onApply }: { query: ListQuery; onApply: (conditions: SearchConditions) => void }) {
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<FilterDraft>({});
  const [appliedDraft, setAppliedDraft] = useState(JSON.stringify(['', {}]));
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify([q, draft]) !== appliedDraft;
  const update = (key: string, value: string | string[]) => { setDraft(previous => ({ ...previous, [key]: value })); setError(null); };
  const apply = (event: FormEvent) => {
    event.preventDefault();
    try {
      const conditions = buildSearchConditions(query, q, draft);
      setError(null); setAppliedDraft(JSON.stringify([q, draft])); onApply(conditions);
    } catch (error) { setError(error instanceof Error ? error.message : '입력을 확인해 주세요.'); }
  };
  return <form className="record-search" aria-label="검색 및 필터" onSubmit={apply}>
    {query.searchEnabled ? <label>검색<input type="search" value={q} placeholder="검색어 입력" onChange={event => { setQ(event.target.value); setError(null); }} /></label> : null}
    {query.filters.map(field => {
      if (field.kind === 'select' || field.kind === 'multiSelect') return <label key={field.key}>{field.label}
        <select aria-label={field.label} multiple={field.kind === 'multiSelect'} value={draft[filterDraftKey(field.key)] ?? (field.kind === 'select' ? '' : [])} onChange={event => update(filterDraftKey(field.key), field.kind === 'select' ? event.target.value : Array.from(event.target.selectedOptions, option => option.value))}>
          {field.kind === 'select' ? <option value="">전체</option> : null}
          {field.options?.map((option, index) => <option key={index} value={String(index)}>{option.label}</option>)}
        </select>
        {field.kind === 'multiSelect' ? <small>여러 값 선택 가능 (Ctrl 또는 ⌘)</small> : null}
      </label>;
      const date = field.kind === 'dateRange';
      return <fieldset key={field.key}><legend>{field.label}{date ? ' (UTC)' : ''}</legend>
        <label>{date ? '시작일' : '최솟값'}<input aria-label={`${field.label} ${date ? '시작일 (UTC)' : '최솟값'}`} type={date ? 'date' : 'number'} step={date ? undefined : 'any'} min={date ? '0001-01-01' : undefined} max={date ? '9999-12-31' : undefined} value={draft[filterDraftKey(field.key, 'start')] ?? ''} onChange={event => update(filterDraftKey(field.key, 'start'), event.target.value)} /></label>
        <label>{date ? '종료일' : '최댓값'}<input aria-label={`${field.label} ${date ? '종료일 (UTC)' : '최댓값'}`} type={date ? 'date' : 'number'} step={date ? undefined : 'any'} min={date ? '0001-01-01' : undefined} max={date ? '9999-12-31' : undefined} value={draft[filterDraftKey(field.key, 'end')] ?? ''} onChange={event => update(filterDraftKey(field.key, 'end'), event.target.value)} /></label>
      </fieldset>;
    })}
    <div className="search-actions"><button type="submit">적용</button><button type="button" onClick={() => { setQ(''); setDraft({}); setAppliedDraft(JSON.stringify(['', {}])); setError(null); onApply({}); }}>초기화</button></div>
    {dirty ? <p role="status">변경한 조건이 아직 적용되지 않았습니다.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </form>;
}
