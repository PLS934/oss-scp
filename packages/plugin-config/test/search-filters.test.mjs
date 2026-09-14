import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { validateRepository } from '../dist/index.js';
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(edit) {
  const root = mkdtempSync(join(tmpdir(), 'search-config-')); roots.push(root);
  for (const name of ['plugins', 'connections']) cpSync(resolve(import.meta.dirname, '../../..', name), join(root, name), { recursive: true });
  const file = join(root, 'plugins/vulnerabilities-local-csv/plugin.json');
  const plugin = JSON.parse(readFileSync(file, 'utf8'));
  for (const field of Object.values(plugin.data.types.vulnerability.fields)) { delete field.searchable; delete field.filter; delete field.sortable; }
  edit(plugin.data.types.vulnerability);
  writeFileSync(file, JSON.stringify(plugin));
  return validateRepository(root);
}
test('검색과 모든 필터 종류를 선언 순서의 최소 메뉴 정보로 공개한다', () => {
  const result = fixture(type => {
    type.fields.cve.searchable = true;
    type.fields.name.filter = { kind: 'multiSelect', options: [{ value: 'A', label: '이름 A' }] };
    type.fields.score.filter = { kind: 'numberRange' };
    type.fields.affected.filter = { kind: 'select', options: [{ value: true, label: '예' }, { value: false, label: '아니요' }] };
    type.fields.observedAt.filter = { kind: 'dateRange' };
  });
  expect(result.ok).toBe(true);
  const list = result.menus.find(menu => menu.pluginId === 'vulnerabilities-local-csv').list;
  expect(list.query).toEqual({ searchEnabled: true, filters: [
    { key: 'name', label: '취약점명', type: 'string', kind: 'multiSelect', options: [{ value: 'A', label: '이름 A' }] },
    { key: 'score', label: '점수', type: 'number', kind: 'numberRange' },
    { key: 'affected', label: '영향 여부', type: 'boolean', kind: 'select', options: [{ value: true, label: '예' }, { value: false, label: '아니요' }] },
    { key: 'observedAt', label: '관측 시각', type: 'datetime', kind: 'dateRange' },
  ] });
  expect(list.columns.every(column => Object.keys(column).sort().join() === 'key,label,type')).toBe(true);
});
test.each([
  type => { type.fields.score.searchable = true; },
  type => { type.fields.cve.filter = { kind: 'numberRange' }; },
  type => { type.fields.score.filter = { kind: 'dateRange' }; },
  type => { type.fields.cve.filter = { kind: 'select', options: [{ value: 1, label: '숫자' }] }; },
  type => { type.fields.cve.filter = { kind: 'select', options: [{ value: 'A', label: 'A' }, { value: 'A', label: '다른 이름' }] }; },
  type => { type.fields.cve.filter = { kind: 'select', options: [{ value: 'A', label: ' ' }] }; },
  type => { type.fields.cve.filter = { kind: 'select', options: [] }; },
  type => { type.fields.cve.filter = { kind: 'unknown' }; },
  type => { type.fields.cve.searchable = true; type.views.list.columns = ['name']; },
  type => { type.fields.nested = { type: 'object', label: '중첩', fields: { name: { type: 'string', label: '이름', searchable: true } } }; },
  type => { type.fields.nested = { type: 'array', label: '중첩', items: { type: 'number', label: '숫자', filter: { kind: 'numberRange' } } }; },
])('잘못된 검색·필터 선언을 필드 위치와 함께 거부한다 (%#)', edit => {
  const result = fixture(edit);
  expect(result.ok).toBe(false);
  expect(result.errors.some(error => error.path.includes('/data/types/vulnerability/fields/'))).toBe(true);
});

test('새 속성을 생략한 플러그인은 query 메타데이터 없이 기존 목록을 유지한다', () => {
  const result = fixture(() => {});
  expect(result.ok).toBe(true);
  expect(result.menus.find(menu => menu.pluginId === 'vulnerabilities-local-csv').list.query).toBeUndefined();
  expect(result.menus.find(menu => menu.pluginId === 'vulnerabilities-local-csv').list.sorts).toBeUndefined();
});

test('정렬 가능한 scalar 목록 필드를 선언 순서의 최소 정보로 공개한다', () => {
  const result = fixture(type => { type.fields.cve.sortable = true; type.fields.score.sortable = true; });
  expect(result.ok).toBe(true);
  expect(result.menus.find(menu => menu.pluginId === 'vulnerabilities-local-csv').list.sorts).toEqual([
    { key: 'cve', label: 'CVE', type: 'string' }, { key: 'score', label: '점수', type: 'number' },
  ]);
});

test.each([
  type => { type.fields.cve.sortable = false; },
  type => { type.fields.cve.sortable = 'yes'; },
  type => { type.fields.cve.sortable = true; type.views.list.columns = ['name']; },
  type => { type.fields.nested = { type: 'object', label: '중첩', fields: { name: { type: 'string', label: '이름', sortable: true } } }; },
])('잘못된 정렬 선언을 거부한다 (%#)', edit => { expect(fixture(edit).ok).toBe(false); });
