export interface PluginConfig {
  apiVersion: 'oss-scp/plugin-v1';
  id: string;
  name: string;
  version: string;
  source: string;
  transform: string;
  data: PluginDataDefinition;
}

export type ScalarFieldType = 'string' | 'number' | 'boolean' | 'datetime';
export type FieldDefinition =
  | { type: ScalarFieldType; required?: boolean }
  | { type: 'object'; required?: boolean; fields: Record<string, FieldDefinition> }
  | { type: 'array'; required?: boolean; items: FieldDefinition };
export interface DataTypeDefinition { uniqueKey: string; fields: Record<string, FieldDefinition>; }
export interface RelationDefinition { from: { types: string[] }; to: { types: string[] }; }
export interface PluginDataDefinition { types: Record<string, DataTypeDefinition>; relations?: Record<string, RelationDefinition>; }
export interface PluginRuntimeDefinition { id: string; name: string; version: string; transformPath: string; data: PluginDataDefinition; }

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

export type SourceConfig =
  | OffsetSourceConfig
  | SingleSourceConfig
  | LocalCsvSourceConfig;

export interface HttpConnectionConfig {
  apiVersion: 'oss-scp/connection-v1';
  id: string;
  connector: 'http';
  config: { baseUrl: string };
}

export interface CollectionDefinitionBase {
  plugin: PluginRuntimeDefinition;
  connection: { id: string; baseUrl: string };
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
  response: { itemsPath: string; metadataPaths?: string[] };
  pagination: { type: 'single' };
};

export interface LocalCsvCollectionDefinition {
  plugin: PluginRuntimeDefinition;
  source: { transport: 'file'; format: 'csv'; path: string };
  batching: { size: number };
  limits: { maxBytes?: number; maxRecordSize?: number };
}

export type CollectionDefinition =
  | OffsetCollectionDefinition
  | SingleCollectionDefinition
  | LocalCsvCollectionDefinition;

export interface ConfigurationIssue {
  file: string;
  path: string;
  message: string;
}

export type ConfigurationResult =
  | { ok: true; definitions: CollectionDefinition[] }
  | { ok: false; errors: ConfigurationIssue[] };
