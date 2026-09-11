import { pluginMenus } from './generated/plugin-menu';

export type MenuItem = (typeof pluginMenus)[number];

export function groupMenus(menus: readonly MenuItem[]) {
  return menus.reduce<Map<string, MenuItem[]>>((groups, menu) => {
    const entries = groups.get(menu.group) ?? [];
    entries.push(menu);
    groups.set(menu.group, entries);
    return groups;
  }, new Map());
}
