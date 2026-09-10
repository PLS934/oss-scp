import { PlatformDbConfigError } from './errors';
import type { PlatformDbAdapterFactory } from './types';

export function selectPlatformDbAdapter(
  type: string,
  adapters: readonly PlatformDbAdapterFactory[],
): PlatformDbAdapterFactory {
  const registry = new Map<string, PlatformDbAdapterFactory>();
  for (const adapter of adapters) {
    if (!adapter || typeof adapter.id !== 'string' || !adapter.id.trim()
      || adapter.id !== adapter.id.trim() || /\p{Cc}/u.test(adapter.id)
      || adapter.contractVersion !== 1 || !Number.isInteger(adapter.defaultPort)
      || adapter.defaultPort < 1 || adapter.defaultPort > 65535
      || typeof adapter.connect !== 'function') {
      throw new PlatformDbConfigError('INVALID_ADAPTER', 'adapters');
    }
    if (registry.has(adapter.id)) {
      throw new PlatformDbConfigError('DUPLICATE_ADAPTER', 'adapters');
    }
    registry.set(adapter.id, adapter);
  }
  const selected = registry.get(type);
  if (!selected) throw new PlatformDbConfigError('UNREGISTERED_ADAPTER', 'PLATFORM_DB_TYPE');
  return selected;
}
