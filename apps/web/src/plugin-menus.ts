import type { MenuItem } from './menu';

const icons = new Set(['server', 'shield', 'repository']);

function isMenu(value: unknown): value is MenuItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return ['title', 'group', 'path', 'dataType', 'pluginId', 'sourceId'].every(key => typeof item[key] === 'string')
    && typeof item.order === 'number' && Number.isInteger(item.order)
    && typeof item.icon === 'string' && icons.has(item.icon);
}

export async function loadPluginMenus(options: { request?: typeof fetch; signal?: AbortSignal } = {}): Promise<MenuItem[]> {
  const response = await (options.request ?? fetch)('/api/v1/plugin-menus', { signal: options.signal });
  if (!response.ok) throw new Error('plugin_menu_request_failed');
  const value: unknown = await response.json();
  if (!Array.isArray(value) || !value.every(isMenu)) throw new Error('plugin_menu_invalid_response');
  return value;
}
