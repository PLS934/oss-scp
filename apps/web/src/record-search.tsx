import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ListQuery, QueryFilter } from './menu';
import type { RecordFilter, SearchConditions } from './records';

export type FilterDraft = Record<string, string | string[] | undefined>;
export const filterDraftKey = (field: string, part = 'value'): string => JSON.stringify([field, part]);
const displayDate = (value: string): string => value.replaceAll('-', '.');
export function dateRangeSummary(start: string, end: string): string {
  if (start && end) return `${displayDate(start)} ~ ${displayDate(end)}`;
  if (start) return `${displayDate(start)} 이후`;
  if (end) return `${displayDate(end)} 이전`;
  return '';
}
export function numberRangeSummary(start: string, end: string): string {
  if (start && end) return `${start} ~ ${end}`;
  if (start) return `${start} 이상`;
  if (end) return `${end} 이하`;
  return '';
}
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

function RangeFilter({ field, start, end, onChange }: { field: QueryFilter; start: string; end: string; onChange: (part: 'start' | 'end', value: string) => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLFieldSetElement>(null);
  const date = field.kind === 'dateRange';
  const summary = date ? dateRangeSummary(start, end) : numberRangeSummary(start, end);
  const title = `${field.label}${date ? ' (UTC)' : ''}`;
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  const updateRange = (part: 'start' | 'end', value: string) => {
    onChange(part, value);
    if (value && (part === 'start' ? end : start)) setOpen(false);
  };
  return <fieldset className="range-filter" ref={container} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
    <legend className="visually-hidden">{title}</legend>
    <div className="range-summary">
      <span className="range-title" aria-hidden="true">{title}</span>
      <button className="range-trigger" type="button" aria-label={`${field.label} 범위 선택`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>{date ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" /></svg> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h10m4 0h2M4 17h2m4 0h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>}</button>
      {summary ? <span className="range-badge"><button type="button" onClick={() => setOpen(true)}>{summary}</button><button type="button" aria-label={`${field.label} 범위 지우기`} onClick={() => { onChange('start', ''); onChange('end', ''); }}>×</button></span> : null}
    </div>
    {open ? <div className="range-popover" role="dialog" aria-label={`${field.label} 범위`}>
      <label>{date ? '시작일' : '최솟값'}<input aria-label={`${field.label} ${date ? '시작일 (UTC)' : '최솟값'}`} type={date ? 'date' : 'number'} step={date ? undefined : 'any'} min={date ? '0001-01-01' : undefined} max={date ? '9999-12-31' : undefined} value={start} onChange={event => updateRange('start', event.target.value)} /></label>
      <span aria-hidden="true">~</span>
      <label>{date ? '종료일' : '최댓값'}<input aria-label={`${field.label} ${date ? '종료일 (UTC)' : '최댓값'}`} type={date ? 'date' : 'number'} step={date ? undefined : 'any'} min={date ? '0001-01-01' : undefined} max={date ? '9999-12-31' : undefined} value={end} onChange={event => updateRange('end', event.target.value)} /></label>
    </div> : null}
  </fieldset>;
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
    {query.searchEnabled ? <div className="record-search-query">
      <span className="record-search-input"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg><input type="search" aria-label="검색" value={q} onChange={event => { setQ(event.target.value); setError(null); }} />{q ? <button className="record-search-clear" type="button" aria-label="검색어 지우기" onClick={() => { setQ(''); setError(null); }}>×</button> : null}</span>
    </div> : null}
    {query.filters.map(field => {
      if (field.kind === 'select' || field.kind === 'multiSelect') return <label key={field.key}>{field.label}
        <select aria-label={field.label} multiple={field.kind === 'multiSelect'} value={draft[filterDraftKey(field.key)] ?? (field.kind === 'select' ? '' : [])} onChange={event => update(filterDraftKey(field.key), field.kind === 'select' ? event.target.value : Array.from(event.target.selectedOptions, option => option.value))}>
          {field.kind === 'select' ? <option value="">전체</option> : null}
          {field.options?.map((option, index) => <option key={index} value={String(index)}>{option.label}</option>)}
        </select>
        {field.kind === 'multiSelect' ? <small>여러 값 선택 가능 (Ctrl 또는 ⌘)</small> : null}
      </label>;
      return <RangeFilter key={field.key} field={field} start={String(draft[filterDraftKey(field.key, 'start')] ?? '')} end={String(draft[filterDraftKey(field.key, 'end')] ?? '')} onChange={(part, value) => update(filterDraftKey(field.key, part), value)} />;
    })}
    <div className="search-actions"><button type="submit">적용</button><button type="button" onClick={() => { setQ(''); setDraft({}); setAppliedDraft(JSON.stringify(['', {}])); setError(null); onApply({}); }}>초기화</button></div>
    {dirty ? <p role="status">변경한 조건이 아직 적용되지 않았습니다.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </form>;
}
