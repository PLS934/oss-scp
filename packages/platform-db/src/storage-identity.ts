import { createHash } from 'node:crypto';
import type { CollectionScope, ExternalKey } from './storage';
import { canonicalExternalKey } from './storage';

function digest(parts: readonly string[]): Buffer {
  const hash = createHash('sha256');
  for (const part of parts) {
    const value = Buffer.from(part, 'utf8');
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(value.length);
    hash.update(length).update(value);
  }
  return hash.digest();
}

export function collectionScopeIdentity(scope: CollectionScope): Buffer {
  return digest([scope.pluginId, scope.sourceId, scope.scopeType, scope.scopeKey, scope.configRevision]);
}

export function recordQueryScopeIdentity(pluginId: string, sourceId: string, dataType: string): Buffer {
  return digest([pluginId, sourceId, dataType]);
}

export function recordIdentity(pluginId: string, sourceId: string, dataType: string, externalKey: ExternalKey): Buffer {
  const key = canonicalExternalKey(externalKey);
  return digest([pluginId, dataType, sourceId, key.type, key.value]);
}

export function relationIdentity(relationType: string, fromId: string, toId: string): Buffer {
  return digest([relationType, fromId, toId]);
}

export function relationScopeIdentity(pluginId: string, sourceId: string): Buffer {
  return digest([pluginId, sourceId]);
}
