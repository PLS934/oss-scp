import type { MenuItem } from './menu';

const icons = new Set(['server', 'shield', 'repository']);
const scalarTypes = new Set(['string', 'number', 'boolean', 'datetime']);

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

function isMenu(value: unknown): value is MenuItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return ['title', 'group', 'path', 'dataType', 'pluginId', 'sourceId'].every(key => typeof item[key] === 'string')
    && typeof item.order === 'number' && Number.isInteger(item.order)
    && typeof item.icon === 'string' && icons.has(item.icon)
    && isList(item.list);
}

export async function loadPluginMenus(options: { request?: typeof fetch; signal?: AbortSignal } = {}): Promise<MenuItem[]> {
  const response = await (options.request ?? fetch)('/api/v1/plugin-menus', { signal: options.signal });
  if (!response.ok) throw new Error('plugin_menu_request_failed');
  const value: unknown = await response.json();
  if (!Array.isArray(value) || !value.every(isMenu)) throw new Error('plugin_menu_invalid_response');
  return value;
}
