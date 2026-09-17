export type FieldDefinition =
  | { type: 'string' | 'number' | 'boolean' | 'datetime'; label: string; required?: boolean; searchable?: true; sortable?: true; filter?: unknown }
  | { type: 'object'; label: string; required?: boolean; fields: Record<string, FieldDefinition> }
  | { type: 'array'; label: string; required?: boolean; items: FieldDefinition };

export interface PluginDetail {
  id: string;
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
  source: Record<string, unknown> & { type: 'http-json' | 'local-csv' | 'http-csv' | 'db-postgres' };
  data: { types: Record<string, { uniqueKey: string; fields: Record<string, FieldDefinition>; views: { list: { columns: string[] }; detail: { sections: Array<{ title: string; fields: string[] }> } } }>; relations?: Record<string, { from: { types: string[] }; to: { types: string[] } }> };
  menu?: Record<string, unknown> & { title: string; path: string; dataType: string; list: { columns: Array<{ key: string; label: string; type: string }>; query?: unknown; sorts?: unknown[] }; detail: { sections: Array<{ title: string; fields: Array<{ key: string; label: string; type: string }> }> } };
  transform: { status: 'available'; kind: 'typescript-source' | 'javascript-runtime'; code: string } | { status: 'unavailable'; reason: string };
}

export class PluginDetailNotFoundError extends Error {}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');

function field(value: unknown): value is FieldDefinition {
  if (!object(value) || typeof value.label !== 'string' || !['string', 'number', 'boolean', 'datetime', 'object', 'array'].includes(value.type as string)) return false;
  if (value.required !== undefined && typeof value.required !== 'boolean') return false;
  if (value.type === 'object') return object(value.fields) && Object.values(value.fields).every(field);
  if (value.type === 'array') return field(value.items);
  return true;
}

function data(value: unknown): value is PluginDetail['data'] {
  if (!object(value) || !object(value.types)) return false;
  if (!Object.values(value.types).every(type => object(type) && typeof type.uniqueKey === 'string' && object(type.fields) && Object.values(type.fields).every(field) && object(type.views) && object(type.views.list) && strings(type.views.list.columns) && object(type.views.detail) && Array.isArray(type.views.detail.sections) && type.views.detail.sections.every(section => object(section) && typeof section.title === 'string' && strings(section.fields)))) return false;
  return value.relations === undefined || (object(value.relations) && Object.values(value.relations).every(relation => object(relation) && object(relation.from) && strings(relation.from.types) && object(relation.to) && strings(relation.to.types)));
}

function source(value: unknown): value is PluginDetail['source'] {
  if (!object(value) || !['http-json', 'local-csv', 'http-csv', 'db-postgres'].includes(value.type as string)) return false;
  if (value.type === 'local-csv') return typeof value.fileName === 'string' && object(value.batching) && object(value.limits);
  if (value.type === 'db-postgres') return value.mode === 'live' && value.persistence === 'none' && object(value.connection) && object(value.queries) && object(value.queryFields) && object(value.batching) && object(value.limits);
  return object(value.connection) && object(value.request) && object(value.limits) && (value.type === 'http-csv' ? object(value.batching) : object(value.response) && object(value.pagination));
}

function menu(value: unknown): value is NonNullable<PluginDetail['menu']> {
  return object(value) && typeof value.title === 'string' && typeof value.path === 'string' && typeof value.dataType === 'string'
    && object(value.list) && Array.isArray(value.list.columns) && value.list.columns.every(item => object(item) && typeof item.key === 'string' && typeof item.label === 'string' && typeof item.type === 'string')
    && object(value.detail) && Array.isArray(value.detail.sections) && value.detail.sections.every(section => object(section) && typeof section.title === 'string' && Array.isArray(section.fields));
}

function isPluginDetail(value: unknown): value is PluginDetail {
  if (!object(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.version !== 'string' || typeof value.enabled !== 'boolean') return false;
  if (value.description !== undefined && typeof value.description !== 'string') return false;
  if (!source(value.source) || !data(value.data) || (value.menu !== undefined && !menu(value.menu)) || !object(value.transform)) return false;
  return value.transform.status === 'unavailable'
    ? typeof value.transform.reason === 'string'
    : value.transform.status === 'available' && ['typescript-source', 'javascript-runtime'].includes(value.transform.kind as string) && typeof value.transform.code === 'string';
}

export async function loadPluginDetail(pluginId: string, options: { request?: typeof fetch; signal?: AbortSignal } = {}): Promise<PluginDetail> {
  const response = await (options.request ?? fetch)(`/api/v1/plugins/${encodeURIComponent(pluginId)}`, { signal: options.signal });
  if (response.status === 404) throw new PluginDetailNotFoundError('plugin_not_found');
  if (!response.ok) throw new Error('plugin_detail_request_failed');
  const value: unknown = await response.json();
  if (!isPluginDetail(value)) throw new Error('plugin_detail_invalid_response');
  return value;
}
