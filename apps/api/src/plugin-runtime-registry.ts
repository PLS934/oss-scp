import type { ClientMenuItem, CollectionDefinition } from '@oss-scp/plugin-config';

export const PLUGIN_RUNTIME_REGISTRY = Symbol('PLUGIN_RUNTIME_REGISTRY');

export interface PluginRuntimeRegistry {
  readonly definitions: readonly CollectionDefinition[];
  readonly menus: readonly ClientMenuItem[];
  getDefinition(pluginId: string): CollectionDefinition | undefined;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function createPluginRuntimeRegistry(
  input: Pick<PluginRuntimeRegistry, 'definitions' | 'menus'>,
): PluginRuntimeRegistry {
  const definitions = deepFreeze(structuredClone(input.definitions));
  const menus = deepFreeze(structuredClone(input.menus));
  const definitionsByPluginId = new Map(
    definitions.map((definition) => [definition.plugin.id, definition]),
  );

  return Object.freeze({
    definitions,
    menus,
    getDefinition: (pluginId: string) => definitionsByPluginId.get(pluginId),
  });
}
