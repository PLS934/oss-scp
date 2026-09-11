export interface MenuItem {
  title: string;
  icon: 'server' | 'shield' | 'repository';
  group: string;
  order: number;
  path: string;
  dataType: string;
  pluginId: string;
  sourceId: string;
}

export function groupMenus(menus: readonly MenuItem[]) {
  return menus.reduce<Map<string, MenuItem[]>>((groups, menu) => {
    const entries = groups.get(menu.group) ?? [];
    entries.push(menu);
    groups.set(menu.group, entries);
    return groups;
  }, new Map());
}
