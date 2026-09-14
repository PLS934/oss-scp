export interface QueryFilter {
  key: string; label: string; type: ListColumn['type'];
  kind: 'select' | 'multiSelect' | 'numberRange' | 'dateRange';
  options?: Array<{ value: string | number | boolean; label: string }>;
}
export interface ListQuery { searchEnabled: boolean; filters: QueryFilter[] }
export type ListSort = ListColumn;

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
  list: { columns: ListColumn[]; query?: ListQuery; sorts?: ListSort[] };
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

export function activeMenuPath(pathname: string, menus: readonly MenuItem[]): string | undefined {
  return menus.filter(menu => pathname === menu.path || pathname.startsWith(`${menu.path}/`)).sort((a, b) => b.path.length - a.path.length)[0]?.path;
}

export function recordDetailPath(menuPath: string, recordId: string): string {
  return `${menuPath}/${encodeURIComponent(recordId)}`;
}
