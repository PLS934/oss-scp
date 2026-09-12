export interface ListColumn {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'datetime';
}

export interface DetailField {
  key: string;
  label: string;
  type: ListColumn['type'] | 'object' | 'array';
}

export interface DetailSection {
  title: string;
  fields: DetailField[];
}

export interface MenuItem {
  title: string;
  icon: 'server' | 'shield' | 'repository';
  group: string;
  order: number;
  path: string;
  dataType: string;
  pluginId: string;
  sourceId: string;
  list: { columns: ListColumn[] };
  detail: { sections: DetailSection[] };
}

export function groupMenus(menus: readonly MenuItem[]) {
  return menus.reduce<Map<string, MenuItem[]>>((groups, menu) => {
    const entries = groups.get(menu.group) ?? [];
    entries.push(menu);
    groups.set(menu.group, entries);
    return groups;
  }, new Map());
}
