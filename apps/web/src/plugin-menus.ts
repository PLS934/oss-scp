import type { MenuItem } from './menu';

const icons = new Set(['server', 'shield', 'repository']);
const scalarTypes = new Set(['string', 'number', 'boolean', 'datetime']);
const fieldTypes = new Set([...scalarTypes, 'object', 'array']);

function isList(value: unknown): value is MenuItem['list'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { columns, query, sorts } = value as Record<string, unknown>;
  if (query !== undefined && !isListQuery(query, columns)) return false;
  if (!Array.isArray(columns) || columns.length === 0 || !columns.every(isListField)) return false;
  if (sorts !== undefined && (!Array.isArray(sorts) || new Set(sorts.map(sort => sort && typeof sort === 'object' ? (sort as Record<string, unknown>).key : undefined)).size !== sorts.length || !sorts.every(sort => isListField(sort) && columns.some(column => column && column.key === sort.key && column.type === sort.type && column.label === sort.label)))) return false;
  return Object.keys(value as Record<string, unknown>).every(key => ['columns', 'query', 'sorts'].includes(key));
}

function isListField(column: unknown): column is MenuItem['list']['columns'][number] {
    if (!column || typeof column !== 'object' || Array.isArray(column)) return false;
    const item = column as Record<string, unknown>;
    return Object.keys(item).sort().join() === 'key,label,type' && typeof item.key === 'string' && item.key.length > 0
      && typeof item.label === 'string' && item.label.length > 0
      && typeof item.type === 'string' && scalarTypes.has(item.type);
}

function isListQuery(value: unknown, columns: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(columns)) return false;
  const query = value as Record<string, unknown>;
  if (typeof query.searchEnabled !== 'boolean' || !Array.isArray(query.filters) || Object.keys(query).some(key => !['searchEnabled', 'filters'].includes(key))) return false;
  if (query.searchEnabled && !columns.some(column => column && column.type === 'string')) return false;
  const keys = new Set<string>();
  return query.filters.every(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const filter = raw as Record<string, unknown>;
    if (typeof filter.key !== 'string' || keys.has(filter.key) || typeof filter.label !== 'string' || !filter.label.trim()) return false;
    keys.add(filter.key);
    if (!columns.some(column => column && column.key === filter.key && column.type === filter.type)) return false;
    if (Object.keys(filter).some(key => !['key', 'label', 'type', 'kind', 'options'].includes(key))) return false;
    if (filter.kind === 'numberRange' || filter.kind === 'dateRange') return filter.type === (filter.kind === 'numberRange' ? 'number' : 'datetime') && filter.options === undefined;
    if (!['select', 'multiSelect'].includes(String(filter.kind)) || !['string', 'number', 'boolean'].includes(String(filter.type))) return false;
    if (!Array.isArray(filter.options) || filter.options.length < 1 || filter.options.length > 100) return false;
    const choices = new Set<string>();
    return filter.options.every(option => {
      if (!option || typeof option !== 'object' || Array.isArray(option)) return false;
      if (Object.keys(option).sort().join() !== 'label,value' || typeof option.label !== 'string' || !option.label.trim() || typeof option.value !== filter.type) return false;
      if (typeof option.value === 'number' && !Number.isFinite(option.value)) return false;
      const key = JSON.stringify(option.value);
      if (choices.has(key)) return false;
      choices.add(key); return true;
    });
  });
}

function isDetail(value: unknown): value is MenuItem['detail'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const sections = (value as Record<string, unknown>).sections;
  return Array.isArray(sections) && sections.length > 0 && sections.every(section => {
    if (!section || typeof section !== 'object' || Array.isArray(section)) return false;
    const item = section as Record<string, unknown>;
    if (typeof item.title !== 'string' || item.title.length === 0 || !Array.isArray(item.fields) || item.fields.length === 0) return false;
    return item.fields.every(field => {
      if (!field || typeof field !== 'object' || Array.isArray(field)) return false;
      const detailField = field as Record<string, unknown>;
      return typeof detailField.key === 'string' && detailField.key.length > 0
        && typeof detailField.label === 'string' && detailField.label.length > 0
        && typeof detailField.type === 'string' && fieldTypes.has(detailField.type);
    });
  });
}

function isMenu(value: unknown): value is MenuItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return ['title', 'group', 'path', 'dataType', 'pluginId', 'sourceId'].every(key => typeof item[key] === 'string')
    && typeof item.order === 'number' && Number.isInteger(item.order)
    && typeof item.icon === 'string' && icons.has(item.icon)
    && isList(item.list)
    && isDetail(item.detail);
}

export async function loadPluginMenus(options: { request?: typeof fetch; signal?: AbortSignal } = {}): Promise<MenuItem[]> {
  const response = await (options.request ?? fetch)('/api/v1/plugin-menus', { signal: options.signal });
  if (!response.ok) throw new Error('plugin_menu_request_failed');
  const value: unknown = await response.json();
  if (!Array.isArray(value) || !value.every(isMenu)) throw new Error('plugin_menu_invalid_response');
  return value;
}
