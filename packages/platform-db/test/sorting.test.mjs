import { expect, test } from 'vitest';
import { QueryError, validateListRecordsInput } from '../dist/index.js';
import { recordOrderSql } from '../dist/sort-sql.js';

test('번호형 scalar 정렬만 정규화한다', () => {
  expect(validateListRecordsInput({ pluginId: 'p', sourceId: 's', dataType: 'd', page: 1, sort: { field: 'score', type: 'number', direction: 'desc' } }).sort).toEqual({ field: 'score', type: 'number', direction: 'desc' });
  for (const sort of [{ field: 'score', type: 'object', direction: 'asc' }, { field: 'score', type: 'number', direction: 'up' }]) {
    expect(() => validateListRecordsInput({ pluginId: 'p', sourceId: 's', dataType: 'd', page: 1, sort })).toThrow(QueryError);
  }
  expect(() => validateListRecordsInput({ pluginId: 'p', sourceId: 's', dataType: 'd', sort: { field: 'score', type: 'number', direction: 'asc' } })).toThrow(QueryError);
});

test('정렬 SQL은 필드 값을 매개변수화하고 방향만 허용값에서 만든다', () => {
  const postgres = recordOrderSql({ field: 'score', type: 'number', direction: 'desc' }, 'postgres', 3);
  expect(postgres.sql).toContain('DESC'); expect(postgres.sql).not.toContain('score'); expect(postgres.parameters).toContain('score');
  const mysql = recordOrderSql({ field: 'name', type: 'string', direction: 'asc' }, 'mysql');
  expect(mysql.sql).toContain('ASC'); expect(mysql.sql).not.toContain('name'); expect(mysql.parameters.some(value => String(value).includes('name'))).toBe(true);
});
