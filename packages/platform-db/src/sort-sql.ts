import { timestampSeconds } from './condition-sql';
import type { RecordSort } from './query';

export function recordOrderSql(sort: RecordSort | undefined, dialect: 'postgres' | 'mysql', offset = 0): { sql: string; parameters: unknown[] } {
  if (!sort) return { sql: 'last_seen_at DESC, id ASC', parameters: [] };
  const parameters: unknown[] = [];
  const pg = dialect === 'postgres';
  const bind = (value: unknown): string => { parameters.push(value); return `$${parameters.length}`; };
  const json = (): string => pg ? `(source_values -> ${bind(sort.field)}::text)` : `JSON_EXTRACT(source_values, ${bind(`$.${JSON.stringify(sort.field)}`)})`;
  const text = (value: string): string => pg ? `(${value} #>> '{}')` : `JSON_UNQUOTE(${value})`;
  const typed = (value: string, type: string): string => pg ? `jsonb_typeof(${value}) = '${type}'` : type === 'number' ? `JSON_TYPE(${value}) IN ('INTEGER', 'DOUBLE', 'DECIMAL')` : `JSON_TYPE(${value}) = '${type.toUpperCase()}'`;
  let valid: string;
  let value: string;
  if (sort.type === 'number') {
    const checked = json(); valid = typed(checked, 'number');
    value = `CASE WHEN ${typed(json(), 'number')} THEN CAST(${text(json())} AS ${pg ? 'numeric' : 'DOUBLE'}) END`;
  } else if (sort.type === 'boolean') {
    const checked = json(); valid = typed(checked, 'boolean');
    value = `CASE WHEN ${typed(json(), 'boolean')} THEN ${text(json())} END`;
  } else if (sort.type === 'datetime') {
    const epoch = (): string => timestampSeconds(text(json()), typed(json(), 'string'), pg);
    const checked = json();
    valid = `(${typed(checked, 'string')} AND ${epoch()} IS NOT NULL)`;
    value = epoch();
  } else {
    const checked = json(); valid = typed(checked, 'string');
    let folded = text(json());
    if (pg) folded = `translate(${folded}, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') COLLATE "C"`;
    else { for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') folded = `REPLACE(${folded}, '${letter}', '${letter.toLowerCase()}')`; folded = `CAST(${folded} AS BINARY)`; }
    value = folded;
  }
  const direction = sort.direction.toUpperCase();
  const sql = `CASE WHEN ${valid} THEN 0 ELSE 1 END ASC, ${value} ${direction}, last_seen_at DESC, id ASC`;
  if (pg) return { sql: sql.replace(/\$(\d+)/g, (_, index: string) => `$${Number(index) + offset}`), parameters };
  const expanded: unknown[] = [];
  return { sql: sql.replace(/\$(\d+)/g, (_, index: string) => { expanded.push(parameters[Number(index) - 1]); return '?'; }), parameters: expanded };
}
