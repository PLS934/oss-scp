export interface PluginSummary {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  sourceType: 'http-json' | 'http-csv' | 'local-csv';
  endpoint?: { url: string; method: 'GET' };
  fileName?: string;
}

function isEndpoint(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (item.method !== 'GET' || typeof item.url !== 'string') return false;
  try {
    const url = new URL(item.url);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

function isPlugin(value: unknown): value is PluginSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && item.id.length > 0
    && typeof item.name === 'string' && item.name.length > 0
    && (item.description === undefined || typeof item.description === 'string')
    && (item.endpoint === undefined || isEndpoint(item.endpoint))
    && (item.fileName === undefined || (typeof item.fileName === 'string' && item.fileName.length > 0 && !/[\\/]/.test(item.fileName)))
    && typeof item.enabled === 'boolean'
    && ['http-json', 'http-csv', 'local-csv'].includes(item.sourceType as string);
}

export async function loadPlugins(options: { request?: typeof fetch; signal?: AbortSignal } = {}): Promise<PluginSummary[]> {
  const response = await (options.request ?? fetch)('/api/v1/plugins', { signal: options.signal });
  if (!response.ok) throw new Error('plugin_request_failed');
  const value: unknown = await response.json();
  if (!Array.isArray(value) || !value.every(isPlugin) || new Set(value.map(item => item.id)).size !== value.length) {
    throw new Error('plugin_invalid_response');
  }
  return value;
}
