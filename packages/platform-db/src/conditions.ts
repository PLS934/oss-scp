import { createHash } from 'node:crypto';
import { QueryError } from './query';

export type FilterValue = string | number | boolean;
export interface QueryFilterDeclaration {
  key: string; type: 'string' | 'number' | 'boolean' | 'datetime';
  kind: 'select' | 'multiSelect' | 'numberRange' | 'dateRange';
  options?: readonly { value: FilterValue; label: string }[];
}
export interface QueryDeclaration { searchFields: readonly string[]; filters: readonly QueryFilterDeclaration[] }
export type RecordFilter =
  | { field: string; kind: 'select'; value: FilterValue }
  | { field: string; kind: 'multiSelect'; values: FilterValue[] }
  | { field: string; kind: 'numberRange'; min?: number; max?: number }
  | { field: string; kind: 'dateRange'; from?: string; to?: string };
export interface RecordConditions { q: string; filters: RecordFilter[]; declaration: QueryDeclaration; fingerprint: string }
export const asciiFold = (value: string): string => value.replace(/[A-Z]/g, letter => letter.toLowerCase());
function invalid(): never { throw new QueryError('INVALID_QUERY'); }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export function validQueryDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function normalizeRecordConditions(rawQ: unknown, rawFilters: unknown, declaration: QueryDeclaration = { searchFields: [], filters: [] }): RecordConditions {
  if (rawQ !== undefined && (typeof rawQ !== 'string' || [...rawQ].length > 200 || rawQ.includes('\0'))) invalid();
  const q = asciiFold((rawQ as string | undefined)?.trim() ?? '');
  if (q && !declaration.searchFields.length) invalid();
  let parsed: unknown = rawFilters ?? [];
  if (typeof parsed === 'string') {
    if (Buffer.byteLength(parsed, 'utf8') > 4096) invalid();
    try { parsed = JSON.parse(parsed); } catch { invalid(); }
  }
  if (!Array.isArray(parsed) || parsed.length > 20 || Buffer.byteLength(JSON.stringify(parsed), 'utf8') > 4096) invalid();
  const filters: RecordFilter[] = [];
  const fields = new Set<string>();
  for (const raw of parsed as unknown[]) {
    if (!object(raw) || typeof raw.field !== 'string' || fields.has(raw.field)) invalid();
    fields.add(raw.field);
    const allowed = declaration.filters.find(item => item.key === raw.field);
    if (!allowed || raw.kind !== allowed.kind) invalid();
    const keys = raw.kind === 'select' ? ['field', 'kind', 'value'] : raw.kind === 'multiSelect' ? ['field', 'kind', 'values'] : raw.kind === 'numberRange' ? ['field', 'kind', 'min', 'max'] : ['field', 'kind', 'from', 'to'];
    if (Object.keys(raw).some(key => !keys.includes(key))) invalid();
    const field = raw.field;
    if (raw.kind === 'select' || raw.kind === 'multiSelect') {
      const values = raw.kind === 'select' ? [raw.value] : raw.values;
      if (!Array.isArray(values) || values.length > 100) invalid();
      for (const value of values as unknown[]) {
        if (typeof value !== allowed.type || !allowed.options?.some(option => option.value === value) || (typeof value === 'number' && !Number.isFinite(value))) invalid();
      }
      if (raw.kind === 'select') filters.push({ field, kind: 'select', value: raw.value as FilterValue });
      else if ((values as FilterValue[]).length) filters.push({ field, kind: 'multiSelect', values: [...new Set(values as FilterValue[])].sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b))) });
    } else if (raw.kind === 'numberRange') {
      const { min, max } = raw;
      if ([min, max].some(value => value !== undefined && (typeof value !== 'number' || !Number.isFinite(value)))) invalid();
      if (min !== undefined && max !== undefined && (min as number) > (max as number)) invalid();
      if (min !== undefined || max !== undefined) filters.push({ field, kind: 'numberRange', ...(min === undefined ? {} : { min: min as number }), ...(max === undefined ? {} : { max: max as number }) });
    } else {
      const { from, to } = raw;
      if ([from, to].some(value => value !== undefined && !validQueryDate(value))) invalid();
      if (from !== undefined && to !== undefined && (from as string) > (to as string)) invalid();
      if (from !== undefined || to !== undefined) filters.push({ field, kind: 'dateRange', ...(from === undefined ? {} : { from: from as string }), ...(to === undefined ? {} : { to: to as string }) });
    }
  }
  filters.sort((a, b) => compare(a.field, b.field));
  const canonicalDeclaration = {
    searchFields: [...declaration.searchFields].sort(compare),
    filters: declaration.filters.map(item => ({ key: item.key, type: item.type, kind: item.kind, ...(item.options ? { values: item.options.map(option => option.value).sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b))) } : {}) })).sort((a, b) => compare(a.key, b.key)),
  };
  const fingerprint = createHash('sha256').update(JSON.stringify([q, filters, canonicalDeclaration])).digest('hex');
  return { q, filters, declaration, fingerprint };
}
