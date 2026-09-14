import type { RecordConditions } from './conditions';

type Dialect = 'postgres' | 'mysql';
// JSON 필드 경로와 조건 값은 모두 매개변수다. MySQL의 반복 위치도 각각 바인딩한다.
export function conditionSql(conditions: RecordConditions | undefined, dialect: Dialect, offset = 0): { sql: string; parameters: unknown[] } {
  if (!conditions || (!conditions.q && !conditions.filters.length)) return { sql: '', parameters: [] };
  const values: unknown[] = [];
  const bind = (value: unknown): string => { values.push(value); return `$${values.length}`; };
  const pg = dialect === 'postgres';
  const json = (field: string): string => pg ? `(source_values -> ${bind(field)}::text)` : `JSON_EXTRACT(source_values, ${bind(`$.${JSON.stringify(field)}`)})`;
  const text = (value: string): string => pg ? `(${value} #>> '{}')` : `JSON_UNQUOTE(${value})`;
  const typed = (value: string, type: string): string => pg ? `jsonb_typeof(${value}) = '${type}'` : type === 'number' ? `JSON_TYPE(${value}) IN ('INTEGER', 'DOUBLE', 'DECIMAL')` : `JSON_TYPE(${value}) = '${type.toUpperCase()}'`;
  const numeric = (value: string): string => `CASE WHEN ${typed(value, 'number')} THEN ${pg ? `CAST(${text(value)} AS numeric)` : `CAST(${text(value)} AS DOUBLE)`} END`;
  const predicates: string[] = [];
  if (conditions.q) {
    const needle = bind(conditions.q);
    predicates.push(`(${conditions.declaration.searchFields.map(field => {
      const value = json(field);
      let folded = text(value);
      if (pg) folded = `translate(${folded}, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')`;
      else for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') folded = `REPLACE(${folded}, '${letter}', '${letter.toLowerCase()}')`;
      const includes = pg ? `strpos(${folded} COLLATE "C", ${needle}::text COLLATE "C") > 0` : `LOCATE(CAST(${needle} AS BINARY), CAST(${folded} AS BINARY)) > 0`;
      return `(${typed(value, 'string')} AND ${includes})`;
    }).join(' OR ')})`);
  }
  for (const filter of conditions.filters) {
    const value = json(filter.field);
    if (filter.kind === 'select' || filter.kind === 'multiSelect') {
      const choices = filter.kind === 'select' ? [filter.value] : filter.values;
      predicates.push(`(${choices.map(choice => {
        if (typeof choice === 'number') return `${numeric(value)} = ${bind(choice)}`;
        const expected = bind(String(choice));
        const equals = pg ? `${text(value)} COLLATE "C" = ${expected}::text COLLATE "C"` : `CAST(${text(value)} AS BINARY) = CAST(${expected} AS BINARY)`;
        return `(${typed(value, typeof choice === 'boolean' ? 'boolean' : 'string')} AND ${equals})`;
      }).join(' OR ')})`);
    } else if (filter.kind === 'numberRange') {
      if (filter.min !== undefined) predicates.push(`${numeric(value)} >= ${bind(filter.min)}`);
      if (filter.max !== undefined) predicates.push(`${numeric(value)} <= ${bind(filter.max)}`);
    } else {
      const epoch = timestampSeconds(text(value), typed(value, 'string'), pg);
      if (filter.from !== undefined) predicates.push(`${epoch} >= ${bind(Date.parse(`${filter.from}T00:00:00Z`) / 1000)}`);
      if (filter.to !== undefined) predicates.push(`${epoch} < ${bind(Date.parse(`${filter.to}T00:00:00Z`) / 1000 + 86400)}`);
    }
  }
  const sql = ` AND (${predicates.join(' AND ')})`;
  if (pg) return { sql: sql.replace(/\$(\d+)/g, (_, index: string) => `$${Number(index) + offset}`), parameters: values };
  const parameters: unknown[] = [];
  return { sql: sql.replace(/\$(\d+)/g, (_, index: string) => { parameters.push(values[Number(index) - 1]); return '?'; }), parameters };
}

// 유효한 ISO 시각만 수치로 변환한다. 달력 검증과 UTC 환산을 직접 수행하여
// DB별 datetime 유효 범위·세션 시간대·잘못된 날짜의 자동 보정을 피한다.
function timestampSeconds(value: string, isString: string, pg: boolean): string {
  const pattern = '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,9})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$';
  const matches = pg ? `${value} ~ '${pattern}'` : `(REGEXP_LIKE(${value}, '${pattern}', 'c') AND CHAR_LENGTH(REGEXP_SUBSTR(${value}, '${pattern}', 1, 1, 'c')) = CHAR_LENGTH(${value}))`;
  const part = (start: number, length: number): string => `CAST(SUBSTRING(${value}, ${start}, ${length}) AS ${pg ? 'numeric' : 'DECIMAL(20,9)'})`;
  const year = part(1, 4), month = part(6, 2), day = part(9, 2);
  const leap = `(MOD(${year}, 4) = 0 AND (MOD(${year}, 100) <> 0 OR MOD(${year}, 400) = 0))`;
  const monthDays = `CASE WHEN ${month} = 2 THEN CASE WHEN ${leap} THEN 29 ELSE 28 END WHEN ${month} IN (4,6,9,11) THEN 30 ELSE 31 END`;
  const previousYear = `(${year} - 1)`;
  const daysBeforeYear = `(365 * ${previousYear} + FLOOR(${previousYear} / 4) - FLOOR(${previousYear} / 100) + FLOOR(${previousYear} / 400))`;
  const monthOffsets = [0,31,59,90,120,151,181,212,243,273,304,334].map((days, index) => `WHEN ${index + 1} THEN ${days}`).join(' ');
  const days = `(${daysBeforeYear} + CASE ${month} ${monthOffsets} END + CASE WHEN ${month} > 2 AND ${leap} THEN 1 ELSE 0 END + ${day} - 1 - 719162)`;
  const zone = `RIGHT(${value}, 6)`;
  const zoneHours = `CAST(SUBSTRING(${zone}, 2, 2) AS ${pg ? 'numeric' : 'DECIMAL(20,9)'})`;
  const zoneMinutes = `CAST(RIGHT(${value}, 2) AS ${pg ? 'numeric' : 'DECIMAL(20,9)'})`;
  const offset = `CASE WHEN RIGHT(${value}, 1) = 'Z' THEN 0 ELSE (CASE WHEN LEFT(${zone}, 1) = '+' THEN 1 ELSE -1 END) * (${zoneHours} * 3600 + ${zoneMinutes} * 60) END`;
  const fraction = pg ? `COALESCE(CAST(substring(${value} from '[.][0-9]+') AS numeric), 0)` : `COALESCE(CAST(REGEXP_SUBSTR(${value}, '[.][0-9]+') AS DECIMAL(10,9)), 0)`;
  return `(CASE WHEN ${isString} AND ${matches} THEN CASE WHEN ${year} >= 1 AND ${day} <= ${monthDays} THEN ${days} * 86400 + ${part(12, 2)} * 3600 + ${part(15, 2)} * 60 + ${part(18, 2)} + ${fraction} - (${offset}) END END)`;
}
