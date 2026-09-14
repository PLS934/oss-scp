import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
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

export function filterDraftSummary(field: QueryFilter, draft: FilterDraft): string {
  if (field.kind === 'select' || field.kind === 'multiSelect') {
    const selected = draft[filterDraftKey(field.key)] ?? (field.kind === 'select' ? '' : []);
    const indices = Array.isArray(selected) ? selected : selected === '' ? [] : [selected];
    return indices.map(index => field.options?.[Number(index)]?.label).filter(Boolean).join(', ');
  }
  const start = String(draft[filterDraftKey(field.key, 'start')] ?? '');
  const end = String(draft[filterDraftKey(field.key, 'end')] ?? '');
  return field.kind === 'dateRange' ? dateRangeSummary(start, end) : numberRangeSummary(start, end);
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

export interface RecordSearchState {
  query: ListQuery; q: string; draft: FilterDraft; dirty: boolean; error: string | null;
  setQ: (value: string) => void;
  update: (key: string, value: string | string[]) => void;
  clearFilter: (field: QueryFilter) => void;
  apply: (event?: FormEvent) => void;
  reset: () => void;
}

export function useRecordSearchState(query: ListQuery, onApply: (conditions: SearchConditions) => void): RecordSearchState {
  const [q, setQuery] = useState('');
  const [draft, setDraft] = useState<FilterDraft>({});
  const [appliedDraft, setAppliedDraft] = useState(JSON.stringify(['', {}]));
  const [error, setError] = useState<string | null>(null);
  const setQ = (value: string) => { setQuery(value); setError(null); };
  const update = (key: string, value: string | string[]) => { setDraft(previous => ({ ...previous, [key]: value })); setError(null); };
  const clearFilter = (field: QueryFilter) => {
    setDraft(previous => {
      const next = { ...previous };
      for (const part of ['value', 'start', 'end']) delete next[filterDraftKey(field.key, part)];
      return next;
    });
    setError(null);
  };
  const apply = (event?: FormEvent) => {
    event?.preventDefault();
    try {
      const conditions = buildSearchConditions(query, q, draft);
      setError(null); setAppliedDraft(JSON.stringify([q, draft])); onApply(conditions);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '입력을 확인해 주세요.'); }
  };
  const reset = () => { setQuery(''); setDraft({}); setAppliedDraft(JSON.stringify(['', {}])); setError(null); onApply({}); };
  return { query, q, draft, dirty: JSON.stringify([q, draft]) !== appliedDraft, error, setQ, update, clearFilter, apply, reset };
}

export function RecordSearch({ query, onApply, resetVersion = 0 }: { query: ListQuery; onApply: (conditions: SearchConditions) => void; resetVersion?: number }) {
  return <RecordSearchStandalone key={resetVersion} query={query} onApply={onApply} />;
}

function RecordSearchStandalone({ query, onApply }: { query: ListQuery; onApply: (conditions: SearchConditions) => void }) {
  return <RecordSearchToolbar state={useRecordSearchState(query, onApply)} />;
}

export function RecordSearchToolbar({ state }: { state: RecordSearchState }) {
  const chips = state.query.filters.map(field => ({ field, summary: filterDraftSummary(field, state.draft) })).filter(item => item.summary);
  return <form className="record-search" aria-label="검색 및 필터" onSubmit={state.apply}>
    {state.query.searchEnabled ? <div className="record-search-query"><span className="record-search-input"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg><input type="search" aria-label="검색" value={state.q} onChange={event => state.setQ(event.target.value)} />{state.q ? <button className="record-search-clear" type="button" aria-label="검색어 지우기" onClick={() => state.setQ('')}>×</button> : null}</span></div> : null}
    {chips.length ? <div className="filter-chips" aria-label="선택한 필터">{chips.map(({ field, summary }) => <span className="filter-chip" key={field.key}><span>{field.label}: {summary}</span><button type="button" aria-label={`${field.label} 조건 삭제`} onClick={() => state.clearFilter(field)}>×</button></span>)}</div> : null}
    <div className="search-actions"><button type="submit">적용</button><button type="button" onClick={state.reset}>초기화</button></div>
    {state.dirty ? <p role="status">변경한 조건이 아직 적용되지 않았습니다.</p> : null}
    {state.error ? <p role="alert">{state.error}</p> : null}
  </form>;
}

interface PopoverPosition { top: number; left: number; ready: boolean }

export function RecordFilterHeader({ field, state }: { field: QueryFilter; state: RecordSearchState }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>({ top: 0, left: 0, ready: false });
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const summary = filterDraftSummary(field, state.draft);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const panel = popover.current?.getBoundingClientRect();
      if (!anchor || !panel) return;
      const margin = 12;
      const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - panel.width - margin));
      const below = anchor.bottom + 8;
      const top = below + panel.height <= window.innerHeight - margin ? below : Math.max(margin, anchor.top - panel.height - 8);
      setPosition({ top, left, ready: true });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !popover.current?.contains(target)) setOpen(false);
    };
    const closeWithEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); setPosition(previous => ({ ...previous, ready: false })); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeWithEscape); };
  }, [open]);
  const close = () => { setOpen(false); setPosition(previous => ({ ...previous, ready: false })); };
  const applyOnEnter = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { close(); trigger.current?.focus(); return; }
    if (event.key === 'Enter' && !(event.target instanceof HTMLSelectElement && event.target.multiple)) { event.preventDefault(); state.apply(); close(); }
  };
  const start = String(state.draft[filterDraftKey(field.key, 'start')] ?? '');
  const end = String(state.draft[filterDraftKey(field.key, 'end')] ?? '');
  const selected = state.draft[filterDraftKey(field.key)] ?? (field.kind === 'select' ? '' : []);
  const style: CSSProperties = { top: position.top, left: position.left, visibility: position.ready ? 'visible' : 'hidden' };
  return <>
    <button ref={trigger} className={`column-filter-trigger${summary ? ' active' : ''}`} type="button" aria-label={`${field.label} 필터`} aria-expanded={open} aria-haspopup="dialog" onClick={() => { setPosition({ top: 0, left: 0, ready: false }); setOpen(value => !value); }}><span>{field.label}</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16l-6 7v5l-4 2v-7Z" /></svg></button>
    {open && typeof document !== 'undefined' ? createPortal(<div ref={popover} className="column-filter-popover" role="dialog" aria-label={`${field.label} 필터`} style={style} onKeyDown={applyOnEnter}>
      {field.kind === 'select' || field.kind === 'multiSelect' ? <label>{field.label}<select aria-label={field.label} multiple={field.kind === 'multiSelect'} value={selected} onChange={event => state.update(filterDraftKey(field.key), field.kind === 'select' ? event.target.value : Array.from(event.target.selectedOptions, option => option.value))}>
        {field.kind === 'select' ? <option value="">전체</option> : null}
        {field.options?.map((option, index) => <option key={index} value={String(index)}>{option.label}</option>)}
      </select>{field.kind === 'multiSelect' ? <small>여러 값 선택 가능 (Ctrl 또는 ⌘)</small> : null}</label> : <fieldset><legend>{field.label}{field.kind === 'dateRange' ? ' (UTC)' : ''}</legend>
        <label>{field.kind === 'dateRange' ? '시작일' : '최솟값'}<input aria-label={`${field.label} ${field.kind === 'dateRange' ? '시작일 (UTC)' : '최솟값'}`} type={field.kind === 'dateRange' ? 'date' : 'number'} step={field.kind === 'numberRange' ? 'any' : undefined} min={field.kind === 'dateRange' ? '0001-01-01' : undefined} max={field.kind === 'dateRange' ? '9999-12-31' : undefined} value={start} onChange={event => state.update(filterDraftKey(field.key, 'start'), event.target.value)} /></label>
        <span aria-hidden="true">~</span>
        <label>{field.kind === 'dateRange' ? '종료일' : '최댓값'}<input aria-label={`${field.label} ${field.kind === 'dateRange' ? '종료일 (UTC)' : '최댓값'}`} type={field.kind === 'dateRange' ? 'date' : 'number'} step={field.kind === 'numberRange' ? 'any' : undefined} min={field.kind === 'dateRange' ? '0001-01-01' : undefined} max={field.kind === 'dateRange' ? '9999-12-31' : undefined} value={end} onChange={event => state.update(filterDraftKey(field.key, 'end'), event.target.value)} /></label>
      </fieldset>}
    </div>, document.body) : null}
  </>;
}
