export interface PluginConfig {
  apiVersion: 'oss-scp/plugin-v1';
  id: string;
  name: string;
  version: string;
  source: string;
}

export interface SourceConfigBase {
  apiVersion: 'oss-scp/source-v1';
  connectionRef: string;
  path: string;
  method: 'GET';
  format: 'json';
  itemsPath: string;
}

export type OffsetSourceConfig = SourceConfigBase & {
  pagination: {
    type: 'offset';
    offsetParam: string;
    limitParam: string;
    start: number;
    limit: number;
    totalPath: string;
  };
};

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
  plugin: { id: string; name: string; version: string };
  connection: { id: string; baseUrl: string };
  request: { method: 'GET'; path: string; format: 'json' };
}

export type OffsetCollectionDefinition = CollectionDefinitionBase & {
  response: { itemsPath: string; totalPath: string };
  pagination: {
    type: 'offset';
    offsetParam: string;
    limitParam: string;
    start: number;
    limit: number;
  };
};

export type SingleCollectionDefinition = CollectionDefinitionBase & {
  response: { itemsPath: string };
  pagination: { type: 'single' };
};

export interface LocalCsvCollectionDefinition {
  plugin: { id: string; name: string; version: string };
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
