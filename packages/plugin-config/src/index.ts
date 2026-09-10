import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface PluginConfig {
  apiVersion: 'oss-scp/plugin-v1';
  id: string;
  name: string;
  version: string;
  source: string;
}

export interface JsonOffsetSourceConfig {
  apiVersion: 'oss-scp/source-v1';
  connectionRef: string;
  path: string;
  method: 'GET';
  format: 'json';
  itemsPath: string;
  pagination: {
    type: 'offset';
    offsetParam: string;
    limitParam: string;
    start: number;
    limit: number;
    totalPath: string;
  };
}

export interface LocalCsvSourceConfig {
  apiVersion: 'oss-scp/source-v1';
  transport: 'file';
  format: 'csv';
  path: string;
  batchSize: number;
  maxBytes?: number;
  maxRecordSize?: number;
}

export type SourceConfig = JsonOffsetSourceConfig | LocalCsvSourceConfig;

export interface HttpConnectionConfig {
  apiVersion: 'oss-scp/connection-v1';
  id: string;
  connector: 'http';
  config: { baseUrl: string };
}

export interface HttpCollectionDefinition {
  plugin: { id: string; name: string; version: string };
  connection: { id: string; baseUrl: string };
  request: { method: 'GET'; path: string; format: 'json' };
  response: { itemsPath: string; totalPath: string };
  pagination: {
    type: 'offset';
    offsetParam: string;
    limitParam: string;
    start: number;
    limit: number;
  };
}

export interface LocalCsvCollectionDefinition {
  plugin: { id: string; name: string; version: string };
  source: { transport: 'file'; format: 'csv'; path: string };
  batching: { size: number };
  limits: { maxBytes?: number; maxRecordSize?: number };
}

export type CollectionDefinition =
  | HttpCollectionDefinition
  | LocalCsvCollectionDefinition;

export interface ConfigurationIssue {
  file: string;
  path: string;
  message: string;
}

export type ConfigurationResult =
  | { ok: true; definitions: CollectionDefinition[] }
  | { ok: false; errors: ConfigurationIssue[] };

interface Registry {
  plugins?: string[];
  connections?: string[];
}

interface Candidate<T> {
  file: string;
  value: T;
}

const schemaRoot = join(__dirname, '..', 'schemas');
const ajv = new Ajv2020({ allErrors: true, strict: true });

function schema(name: string): object {
  return JSON.parse(readFileSync(join(schemaRoot, name), 'utf8')) as object;
}

const validatePlugin = ajv.compile<PluginConfig>(schema('plugin.schema.json'));
const validateSource = ajv.compile<SourceConfig>(schema('source.schema.json'));
const validateConnection = ajv.compile<HttpConnectionConfig>(
  schema('connection.schema.json'),
);

function displayPath(root: string, file: string): string {
  const path = relative(root, file);
  return path.length > 0 ? path : '.';
}

function issue(
  errors: ConfigurationIssue[],
  root: string,
  file: string,
  path: string,
  message: string,
): void {
  errors.push({ file: displayPath(root, file), path, message });
}

function readJson(
  root: string,
  file: string,
  errors: ConfigurationIssue[],
): unknown | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch (error) {
    const message =
      error instanceof SyntaxError ? 'invalid JSON' : 'file cannot be read';
    issue(errors, root, file, '/', message);
    return undefined;
  }
}

function addSchemaErrors(
  root: string,
  file: string,
  validationErrors: ErrorObject[] | null | undefined,
  errors: ConfigurationIssue[],
): void {
  for (const validationError of validationErrors ?? []) {
    const property =
      validationError.keyword === 'additionalProperties' &&
      typeof validationError.params.additionalProperty === 'string'
        ? `/${validationError.params.additionalProperty}`
        : validationError.keyword === 'required' &&
            typeof validationError.params.missingProperty === 'string'
          ? `/${validationError.params.missingProperty}`
          : '';
    issue(
      errors,
      root,
      file,
      `${validationError.instancePath}${property}` || '/',
      validationError.message ?? 'invalid value',
    );
  }
}

function validate<T>(
  root: string,
  file: string,
  value: unknown,
  validator: ValidateFunction<T>,
  errors: ConfigurationIssue[],
): value is T {
  if (validator(value)) return true;
  addSchemaErrors(root, file, validator.errors, errors);
  return false;
}

function safeResolve(
  root: string,
  base: string,
  requested: string,
  file: string,
  path: string,
  errors: ConfigurationIssue[],
): string | undefined {
  if (isAbsolute(requested)) {
    issue(errors, root, file, path, 'absolute paths are not allowed');
    return undefined;
  }
  const resolved = resolve(base, requested);
  if (resolved !== base && !resolved.startsWith(`${base}${sep}`)) {
    issue(errors, root, file, path, 'path must stay inside its configuration root');
    return undefined;
  }
  return resolved;
}

function readRegistry(
  root: string,
  file: string,
  key: 'plugins' | 'connections',
  errors: ConfigurationIssue[],
): string[] {
  const value = readJson(root, file, errors) as Registry | undefined;
  if (value === undefined) return [];
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((item) => item !== key) ||
    !Array.isArray(value[key]) ||
    !value[key].every((item) => typeof item === 'string')
  ) {
    issue(errors, root, file, '/', `registry must contain only a ${key} string array`);
    return [];
  }
  return value[key];
}

function loadConnections(
  root: string,
  errors: ConfigurationIssue[],
): Map<string, Candidate<HttpConnectionConfig>> {
  const connectionRoot = join(root, 'connections');
  const registryFile = join(connectionRoot, 'registry.json');
  const entries = readRegistry(root, registryFile, 'connections', errors);
  const connections = new Map<string, Candidate<HttpConnectionConfig>>();

  for (const entry of entries) {
    const file = safeResolve(
      root,
      connectionRoot,
      entry,
      registryFile,
      '/connections',
      errors,
    );
    if (!file) continue;
    const value = readJson(root, file, errors);
    if (value === undefined || !validate(root, file, value, validateConnection, errors)) {
      continue;
    }
    if (connections.has(value.id)) {
      issue(errors, root, file, '/id', `duplicate connection id: ${value.id}`);
      continue;
    }
    connections.set(value.id, { file, value });
  }
  return connections;
}

function loadPlugins(
  root: string,
  connections: Map<string, Candidate<HttpConnectionConfig>>,
  errors: ConfigurationIssue[],
): CollectionDefinition[] {
  const pluginRoot = join(root, 'plugins');
  const registryFile = join(pluginRoot, 'registry.json');
  const entries = readRegistry(root, registryFile, 'plugins', errors);
  const definitions: CollectionDefinition[] = [];
  const pluginIds = new Set<string>();

  for (const entry of entries) {
    const pluginDirectory = safeResolve(
      root,
      pluginRoot,
      entry,
      registryFile,
      '/plugins',
      errors,
    );
    if (!pluginDirectory) continue;
    const pluginFile = join(pluginDirectory, 'plugin.json');
    const pluginValue = readJson(root, pluginFile, errors);
    if (
      pluginValue === undefined ||
      !validate(root, pluginFile, pluginValue, validatePlugin, errors)
    ) {
      continue;
    }
    if (pluginIds.has(pluginValue.id)) {
      issue(errors, root, pluginFile, '/id', `duplicate plugin id: ${pluginValue.id}`);
      continue;
    }
    pluginIds.add(pluginValue.id);

    const sourceFile = safeResolve(
      root,
      pluginDirectory,
      pluginValue.source,
      pluginFile,
      '/source',
      errors,
    );
    if (!sourceFile) continue;
    const sourceValue = readJson(root, sourceFile, errors);
    if (
      sourceValue === undefined ||
      !validate(root, sourceFile, sourceValue, validateSource, errors)
    ) {
      continue;
    }
    if (sourceValue.format === 'csv') {
      const csvPath = safeResolve(
        root,
        root,
        sourceValue.path,
        sourceFile,
        '/path',
        errors,
      );
      if (!csvPath) continue;
      definitions.push({
        plugin: {
          id: pluginValue.id,
          name: pluginValue.name,
          version: pluginValue.version,
        },
        source: { transport: 'file', format: 'csv', path: csvPath },
        batching: { size: sourceValue.batchSize },
        limits: {
          ...(sourceValue.maxBytes === undefined ? {} : { maxBytes: sourceValue.maxBytes }),
          ...(sourceValue.maxRecordSize === undefined
            ? {}
            : { maxRecordSize: sourceValue.maxRecordSize }),
        },
      });
      continue;
    }

    const connection = connections.get(sourceValue.connectionRef);
    if (!connection) {
      issue(
        errors,
        root,
        sourceFile,
        '/connectionRef',
        `unknown connection id: ${sourceValue.connectionRef}`,
      );
      continue;
    }
    definitions.push({
      plugin: {
        id: pluginValue.id,
        name: pluginValue.name,
        version: pluginValue.version,
      },
      connection: {
        id: connection.value.id,
        baseUrl: connection.value.config.baseUrl,
      },
      request: {
        method: sourceValue.method,
        path: sourceValue.path,
        format: sourceValue.format,
      },
      response: {
        itemsPath: sourceValue.itemsPath,
        totalPath: sourceValue.pagination.totalPath,
      },
      pagination: {
        type: sourceValue.pagination.type,
        offsetParam: sourceValue.pagination.offsetParam,
        limitParam: sourceValue.pagination.limitParam,
        start: sourceValue.pagination.start,
        limit: sourceValue.pagination.limit,
      },
    });
  }
  return definitions;
}

export function validateRepository(rootDirectory: string): ConfigurationResult {
  const root = resolve(rootDirectory);
  const errors: ConfigurationIssue[] = [];
  const connections = loadConnections(root, errors);
  const definitions = loadPlugins(root, connections, errors);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, definitions };
}
