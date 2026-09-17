export interface PluginConfig {
  apiVersion: 'oss-scp/plugin-v1';
  id: string;
  name: string;
  version: string;
  description?: string;
  enabled?: boolean;
  source: string;
  transform: string;
  data: PluginDataDefinition;
  menu?: PluginMenuDefinition;
}

export type PluginMenuIcon = 'server' | 'shield' | 'repository';
export interface PluginMenuDefinition { title: string; icon: PluginMenuIcon; group: string; order: number; path: string; dataType: string; }
export interface ClientListColumn { key: string; label: string; type: ScalarFieldType; }
export type FilterValue = string | number | boolean;
export type FieldFilter = { kind: 'select' | 'multiSelect'; options: Array<{ value: FilterValue; label: string }> } | { kind: 'numberRange' } | { kind: 'dateRange' };
export type ClientQueryFilter = ClientListColumn & FieldFilter;
export interface ClientListDefinition { columns: ClientListColumn[]; query?: { searchEnabled: boolean; filters: ClientQueryFilter[] }; sorts?: ClientListColumn[]; }
export interface ClientDetailField { key: string; label: string; type: FieldType; }
export interface ClientDetailSection { title: string; fields: ClientDetailField[]; }
export interface ClientDetailDefinition { sections: ClientDetailSection[]; }
export interface ClientMenuItem extends PluginMenuDefinition { pluginId: string; sourceId: string; sourceMode?: 'live'; list: ClientListDefinition; detail: ClientDetailDefinition; }

export type ScalarFieldType = 'string' | 'number' | 'boolean' | 'datetime';
export type FieldType = ScalarFieldType | 'object' | 'array';
export type FieldDefinition =
  | { type: ScalarFieldType; label: string; required?: boolean; searchable?: true; sortable?: true; filter?: FieldFilter }
  | { type: 'object'; label: string; required?: boolean; fields: Record<string, FieldDefinition> }
  | { type: 'array'; label: string; required?: boolean; items: FieldDefinition };
export interface DataTypeDefinition {
  uniqueKey: string;
  fields: Record<string, FieldDefinition>;
  views: { list: { columns: string[] }; detail: { sections: Array<{ title: string; fields: string[] }> } };
}
export interface RelationDefinition { from: { types: string[] }; to: { types: string[] }; }
export interface PluginDataDefinition { types: Record<string, DataTypeDefinition>; relations?: Record<string, RelationDefinition>; }
export interface PluginRuntimeDefinition { id: string; name: string; version: string; transformPath: string; data: PluginDataDefinition; menu?: PluginMenuDefinition; }

export interface SourceConfigBase {
  apiVersion: 'oss-scp/source-v1';
  connectionRef: string;
  path: string;
  method: 'GET';
  format: 'json';
  itemsPath: string;
  metadataPaths?: string[];
}

export type OffsetSourceConfig = SourceConfigBase & {
  limits: HttpCollectionLimits;
  pagination: {
    type: 'offset';
    offsetParam: string;
    limitParam: string;
    start: number;
    limit: number;
    totalPath: string;
  };
};

export interface HttpCollectionLimits {
  timeoutMs: number;
  maxResponseBytes: number;
  maxRecordBytes: number;
}

export type SingleSourceConfig = SourceConfigBase & {
  limits: HttpCollectionLimits;
  pagination: { type: 'single' };
};

export interface LocalCsvSourceConfig {
  apiVersion: 'oss-scp/source-v1';
  transport: 'file';
  format: 'csv';
  path: string;
  batchSize: number;
  maxBytes?: number;
  maxRecordSize?: number;
}

export interface HttpCsvSourceConfig {
  apiVersion: 'oss-scp/source-v1';
  transport: 'http';
  connectionRef: string;
  path: string;
  method: 'GET';
  format: 'csv';
  batchSize: number;
  limits: {
    timeoutMs: number;
    maxDownloadBytes: number;
    maxCsvBytes: number;
    maxRecordSize: number;
  };
}

export interface PostgresSourceConfig {
  apiVersion: 'oss-scp/source-v1';
  type: 'db-postgres';
  persistence: 'none';
  connectionRef: string;
  listQuery: string;
  detailQuery: string;
  externalKeyColumn: string;
  queryFields: Record<string, { column: string; type: ScalarFieldType }>;
  batchSize: number;
  limits: { rowCap: number; timeoutMs: number; maxResponseBytes: number };
  cache?: { kind: 'watchlist'; ttlSeconds: 600 };
}

export type SourceConfig =
  | OffsetSourceConfig
  | SingleSourceConfig
  | LocalCsvSourceConfig
  | HttpCsvSourceConfig
  | PostgresSourceConfig;

export interface HttpConnectionConfig {
  apiVersion: 'oss-scp/connection-v1';
  id: string;
  connector: 'http';
  config: { baseUrl: string; auth?: HttpAuthentication };
}

export type EnvironmentReference = { env: string };
export type HttpAuthentication =
  | { type: 'apiKey'; header: string; valueRef: EnvironmentReference }
  | { type: 'bearer'; tokenRef: EnvironmentReference }
  | { type: 'basic'; usernameRef: EnvironmentReference; passwordRef: EnvironmentReference };

export type SecretReference = { env: string } | { file: string };
export interface PostgresConnectionConfig {
  apiVersion: 'oss-scp/connection-v1';
  id: string;
  connector: 'postgres';
  config: { host: string; port: number; database: string; user: string; passwordRef: SecretReference; ssl?: 'disable' | 'require' };
}
export type ConnectionConfig = HttpConnectionConfig | PostgresConnectionConfig;

export interface CollectionDefinitionBase {
  plugin: PluginRuntimeDefinition;
  connection: { id: string; baseUrl: string; auth?: HttpAuthentication };
  request: { method: 'GET'; path: string; format: 'json' };
}

export type OffsetCollectionDefinition = CollectionDefinitionBase & {
  limits: HttpCollectionLimits;
  response: { itemsPath: string; totalPath: string; metadataPaths?: string[] };
  pagination: {
    type: 'offset';
    offsetParam: string;
    limitParam: string;
    start: number;
    limit: number;
  };
};

export type SingleCollectionDefinition = CollectionDefinitionBase & {
  limits: HttpCollectionLimits;
  response: { itemsPath: string; metadataPaths?: string[] };
  pagination: { type: 'single' };
};

export interface LocalCsvCollectionDefinition {
  plugin: PluginRuntimeDefinition;
  source: { transport: 'file'; format: 'csv'; path: string };
  batching: { size: number };
  limits: { maxBytes?: number; maxRecordSize?: number };
}

export interface HttpCsvCollectionDefinition {
  plugin: PluginRuntimeDefinition;
  connection: { id: string; baseUrl: string; auth?: HttpAuthentication };
  request: { transport: 'http'; method: 'GET'; path: string; format: 'csv' };
  batching: { size: number };
  limits: HttpCsvSourceConfig['limits'];
}

export interface LivePostgresDefinition {
  plugin: PluginRuntimeDefinition;
  mode: 'live';
  persistence: 'none';
  connection: PostgresConnectionConfig;
  source: PostgresSourceConfig;
}

export type CollectionDefinition =
  | OffsetCollectionDefinition
  | SingleCollectionDefinition
  | LocalCsvCollectionDefinition
  | HttpCsvCollectionDefinition
  | LivePostgresDefinition;

export interface ConfigurationIssue {
  file: string;
  path: string;
  message: string;
}

export interface ClientPluginSummary {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  sourceType: 'http-json' | 'http-csv' | 'local-csv' | 'db-postgres';
  endpoint?: { url: string; method: 'GET' };
  fileName?: string;
}

export type ClientPluginSourceDetail =
  | { type: 'http-json'; connection: { id: string; baseUrl: string }; request: { method: 'GET'; path: string; format: 'json' }; response: { itemsPath: string; totalPath?: string; metadataPaths?: string[] }; pagination: OffsetSourceConfig['pagination'] | SingleSourceConfig['pagination']; limits: HttpCollectionLimits }
  | { type: 'local-csv'; fileName: string; batching: { size: number }; limits: LocalCsvCollectionDefinition['limits'] }
  | { type: 'http-csv'; connection: { id: string; baseUrl: string }; request: { method: 'GET'; path: string; format: 'csv' }; batching: { size: number }; limits: HttpCsvSourceConfig['limits'] }
  | { type: 'db-postgres'; mode: 'live'; persistence: 'none'; connection: { id: string; host: string; port: number; database: string; ssl?: 'disable' | 'require' }; queries: { list: string; detail: string }; externalKeyColumn: string; queryFields: PostgresSourceConfig['queryFields']; batching: { size: number }; limits: PostgresSourceConfig['limits']; cache?: PostgresSourceConfig['cache'] };

export type ClientTransformDetail =
  | { status: 'available'; kind: 'typescript-source' | 'javascript-runtime'; code: string }
  | { status: 'unavailable'; reason: string };

export interface ClientPluginConfiguration {
  id: string;
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
  source: ClientPluginSourceDetail;
  data: PluginDataDefinition;
  menu?: PluginMenuDefinition & { list: ClientListDefinition; detail: ClientDetailDefinition };
}

export interface ClientPluginDetail extends ClientPluginConfiguration {
  transform: ClientTransformDetail;
}

export interface PluginTransformFiles {
  pluginRoot: string;
  runtimePath: string;
  sourcePath?: string;
}

export interface LoadedPluginDetail {
  configuration: ClientPluginConfiguration;
  transformFiles: PluginTransformFiles;
}

export type ConfigurationResult =
  | { ok: true; definitions: CollectionDefinition[]; menus: ClientMenuItem[]; plugins: ClientPluginSummary[]; pluginDetails: LoadedPluginDetail[] }
  | { ok: false; errors: ConfigurationIssue[] };
