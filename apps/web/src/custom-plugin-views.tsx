import type { ComponentType } from 'react';
import type { MenuItem } from './menu';
import { Sample2RepositoryList } from './sample2-repository-list';

export interface CustomPluginListProps {
  menu: MenuItem;
}

export interface CustomPluginDetailProps {
  menu: MenuItem;
  recordId: string;
}

export interface CustomPluginViewSet {
  List?: ComponentType<CustomPluginListProps>;
  Detail?: ComponentType<CustomPluginDetailProps>;
}

export type CustomPluginViewRegistry = Readonly<Record<string, CustomPluginViewSet | undefined>>;

export const customPluginViews: CustomPluginViewRegistry = {
  'sample2-single-api': { List: Sample2RepositoryList },
};

export function resolveCustomPluginViews(registry: CustomPluginViewRegistry, pluginId: string): CustomPluginViewSet {
  return registry[pluginId] ?? {};
}
