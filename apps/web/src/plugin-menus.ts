import type { MenuItem } from './menu';

const icons = new Set(['server', 'shield', 'repository']);
const scalarTypes = new Set(['string', 'number', 'boolean', 'datetime']);
const fieldTypes = new Set([...scalarTypes, 'object', 'array']);

function isList(value: unknown): value is MenuItem['list'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const columns = (value as Record<string, unknown>).columns;
  return Array.isArray(columns) && columns.length > 0 && columns.every(column => {
    if (!column || typeof column !== 'object' || Array.isArray(column)) return false;
    const item = column as Record<string, unknown>;
    return typeof item.key === 'string' && item.key.length > 0
      && typeof item.label === 'string' && item.label.length > 0
      && typeof item.type === 'string' && scalarTypes.has(item.type);
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
