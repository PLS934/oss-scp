import type { ClientPluginSummary, ClientMenuItem, CollectionDefinition } from '@oss-scp/plugin-config';
import { createHash } from 'node:crypto';

export const PLUGIN_RUNTIME_REGISTRY = Symbol('PLUGIN_RUNTIME_REGISTRY');

export interface PluginRuntimeRegistry {
  readonly plugins: readonly ClientPluginSummary[];
  readonly definitions: readonly CollectionDefinition[];
  readonly menus: readonly ClientMenuItem[];
  getDefinition(pluginId: string): CollectionDefinition | undefined;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'transformPath')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]),
  );
  return value;
}

export function definitionRevision(definition: CollectionDefinition): string {
  return createHash('sha256').update(JSON.stringify(stable(definition))).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function createPluginRuntimeRegistry(
  input: Pick<PluginRuntimeRegistry, 'definitions' | 'menus'> & Partial<Pick<PluginRuntimeRegistry, 'plugins'>>,
): PluginRuntimeRegistry {
  const definitions = deepFreeze(structuredClone(input.definitions));
  const menus = deepFreeze(structuredClone(input.menus));
  const definitionsByPluginId = new Map(
    definitions.map((definition) => [definition.plugin.id, definition]),
  );

  return Object.freeze({
    definitions,
    menus,
    plugins: deepFreeze(structuredClone(input.plugins ?? [])),
    getDefinition: (pluginId: string) => definitionsByPluginId.get(pluginId),
  });
}
