import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { loadSourceDefinition } from './source-loader';
import { loadLocalCsvSource } from './source-loaders/file';
import { loadHttpCsvSource } from './source-loaders/http-csv';
import type {
  CollectionDefinition,
  ClientDetailDefinition,
  ClientListDefinition,
  ClientMenuItem,
  ClientPluginSummary,
  CollectionDefinitionBase,
  ConfigurationIssue,
  ConfigurationResult,
  HttpConnectionConfig,
  PluginConfig,
  PluginRuntimeDefinition,
  SourceConfig,
} from './types';

export type * from './types';

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

ajv.addSchema(schema('source-offset.schema.json'));
ajv.addSchema(schema('source-single.schema.json'));

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
  if (existsSync(resolved)) {
    const realRoot = realpathSync(root);
    const realResolved = realpathSync(resolved);
    if (realResolved !== realRoot && !realResolved.startsWith(`${realRoot}${sep}`)) {
      issue(errors, root, file, path, 'resolved path must stay inside its configuration root');
      return undefined;
    }
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
  menus: ClientMenuItem[],
  plugins: ClientPluginSummary[],
): CollectionDefinition[] {
  const pluginRoot = join(root, 'plugins');
  const registryFile = join(pluginRoot, 'registry.json');
  const entries = readRegistry(root, registryFile, 'plugins', errors);
  const definitions: CollectionDefinition[] = [];
  const pluginIds = new Set<string>();
  const menuPaths = new Map<string, string>();

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

    const transformPath = safeResolve(root, pluginDirectory, pluginValue.transform, pluginFile, '/transform', errors);
    if (!transformPath) continue;
    if (!transformPath.endsWith('.js')) {
      issue(errors, root, pluginFile, '/transform', 'transform must be a JavaScript file');
      continue;
    }
    if (!existsSync(transformPath)) {
      issue(errors, root, transformPath, '/', 'transform file cannot be read');
      continue;
    }
    let invalidReference = false;
    const clientLists = new Map<string, ClientListDefinition>();
    const clientDetails = new Map<string, ClientDetailDefinition>();
    for (const [type, definition] of Object.entries(pluginValue.data.types)) {
      if (!(definition.uniqueKey in definition.fields)) {
        issue(errors, root, pluginFile, `/data/types/${type}/uniqueKey`, 'unique key must reference a declared field');
        invalidReference = true;
      }
      const columns: ClientListDefinition['columns'] = [];
      for (const [index, key] of definition.views.list.columns.entries()) {
        const field = definition.fields[key];
        const path = `/data/types/${type}/views/list/columns/${index}`;
        if (!field) {
          issue(errors, root, pluginFile, path, `unknown field: ${key}`);
          invalidReference = true;
          continue;
        }
        if (field.type === 'object' || field.type === 'array') {
          issue(errors, root, pluginFile, path, `list column must reference a scalar field: ${key}`);
          invalidReference = true;
          continue;
        }
        columns.push({ key, label: field.label, type: field.type });
      }
      clientLists.set(type, { columns });

      const sectionTitles = new Set<string>();
      const detailFields = new Set<string>();
      const sections: ClientDetailDefinition['sections'] = [];
      for (const [sectionIndex, section] of definition.views.detail.sections.entries()) {
        const sectionPath = `/data/types/${type}/views/detail/sections/${sectionIndex}`;
        if (sectionTitles.has(section.title)) {
          issue(errors, root, pluginFile, `${sectionPath}/title`, `duplicate detail section title: ${section.title}`);
          invalidReference = true;
        } else {
          sectionTitles.add(section.title);
        }
        const fields: ClientDetailDefinition['sections'][number]['fields'] = [];
        for (const [fieldIndex, key] of section.fields.entries()) {
          const path = `${sectionPath}/fields/${fieldIndex}`;
          const field = definition.fields[key];
          if (!field) {
            issue(errors, root, pluginFile, path, `unknown field: ${key}`);
            invalidReference = true;
            continue;
          }
          if (detailFields.has(key)) {
            issue(errors, root, pluginFile, path, `duplicate detail field: ${key}`);
            invalidReference = true;
            continue;
          }
          detailFields.add(key);
          fields.push({ key, label: field.label, type: field.type });
        }
        sections.push({ title: section.title, fields });
      }
      clientDetails.set(type, { sections });
    }
    for (const [relation, definition] of Object.entries(pluginValue.data.relations ?? {})) {
      for (const [end, types] of [['from', definition.from.types], ['to', definition.to.types]] as const) {
        for (const type of types) {
          if (!(type in pluginValue.data.types)) {
            issue(errors, root, pluginFile, `/data/relations/${relation}/${end}/types`, `unknown data type: ${type}`);
            invalidReference = true;
          }
        }
      }
    }
    if (pluginValue.menu) {
      if (!(pluginValue.menu.dataType in pluginValue.data.types)) {
        issue(errors, root, pluginFile, '/menu/dataType', `unknown data type: ${pluginValue.menu.dataType}`);
        invalidReference = true;
      }
      const existingMenu = menuPaths.get(pluginValue.menu.path);
      if (existingMenu) {
        issue(errors, root, pluginFile, '/menu/path', `duplicate menu path: ${pluginValue.menu.path} (already declared by ${existingMenu})`);
        invalidReference = true;
      } else {
        menuPaths.set(pluginValue.menu.path, displayPath(root, pluginFile));
      }
    }
    if (invalidReference) continue;
    const runtimePlugin: PluginRuntimeDefinition = {
      id: pluginValue.id,
      name: pluginValue.name,
      version: pluginValue.version,
      transformPath,
      data: pluginValue.data,
      menu: pluginValue.menu,
    };

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
    let endpoint: ClientPluginSummary['endpoint'];
    let fileName: string | undefined;
    if (sourceValue.format === 'csv' && sourceValue.transport === 'file') {
      fileName = basename(sourceValue.path);
    } else {
      const connection = connections.get(sourceValue.connectionRef);
      if (connection) {
        let url: URL;
        try { url = new URL(sourceValue.path, connection.value.config.baseUrl); }
        catch {
          issue(errors, root, sourceFile, '/path', 'invalid HTTP endpoint');
          continue;
        }
        // 공개 표시값에는 인증정보·쿼리·fragment를 포함하지 않는다.
        endpoint = { url: `${url.origin}${url.pathname}`, method: sourceValue.method };
        if (sourceValue.format === 'csv') fileName = basename(url.pathname);
      }
    }
    plugins.push({
      id: pluginValue.id,
      name: pluginValue.name,
      ...(pluginValue.description === undefined ? {} : { description: pluginValue.description }),
      enabled: pluginValue.enabled ?? true,
      sourceType: sourceValue.format === 'csv' ? (sourceValue.transport === 'file' ? 'local-csv' : 'http-csv') : 'http-json',
      ...(endpoint ? { endpoint } : {}),
      ...(fileName === undefined ? {} : { fileName }),
    });
    if (pluginValue.enabled === false) continue;
    if (sourceValue.format === 'csv' && sourceValue.transport === 'file') {
      const csvPath = safeResolve(
        root,
        root,
        sourceValue.path,
        sourceFile,
        '/path',
        errors,
      );
      if (!csvPath) continue;
      definitions.push(loadLocalCsvSource(runtimePlugin, sourceValue, csvPath));
      if (pluginValue.menu) menus.push({ ...pluginValue.menu, pluginId: pluginValue.id, sourceId: `file:${sourceValue.path}`, list: clientLists.get(pluginValue.menu.dataType)!, detail: clientDetails.get(pluginValue.menu.dataType)! });
      continue;
    }

    if (sourceValue.format === 'csv') {
      if (sourceValue.limits.maxRecordSize > sourceValue.limits.maxCsvBytes) {
        issue(errors, root, sourceFile, '/limits/maxRecordSize', 'must be less than or equal to maxCsvBytes');
        continue;
      }
      const connection = connections.get(sourceValue.connectionRef);
      if (!connection) {
        issue(errors, root, sourceFile, '/connectionRef', `unknown connection id: ${sourceValue.connectionRef}`);
        continue;
      }
      definitions.push(loadHttpCsvSource(runtimePlugin, sourceValue, connection.value));
      if (pluginValue.menu) menus.push({ ...pluginValue.menu, pluginId: pluginValue.id, sourceId: connection.value.id, list: clientLists.get(pluginValue.menu.dataType)!, detail: clientDetails.get(pluginValue.menu.dataType)! });
      continue;
    }

    if (sourceValue.limits.maxRecordBytes > sourceValue.limits.maxResponseBytes) {
      issue(
        errors,
        root,
        sourceFile,
        '/limits/maxRecordBytes',
        'must be less than or equal to maxResponseBytes',
      );
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
    const commonDefinition: CollectionDefinitionBase = {
      plugin: runtimePlugin,
      connection: {
        id: connection.value.id,
        baseUrl: connection.value.config.baseUrl,
      },
      request: {
        method: sourceValue.method,
        path: sourceValue.path,
        format: sourceValue.format,
      },
    };
    definitions.push(loadSourceDefinition(commonDefinition, sourceValue));
    if (pluginValue.menu) menus.push({ ...pluginValue.menu, pluginId: pluginValue.id, sourceId: connection.value.id, list: clientLists.get(pluginValue.menu.dataType)!, detail: clientDetails.get(pluginValue.menu.dataType)! });
  }
  return definitions;
}

export function validateRepository(rootDirectory: string): ConfigurationResult {
  const root = resolve(rootDirectory);
  const errors: ConfigurationIssue[] = [];
  const connections = loadConnections(root, errors);
  const menus: ClientMenuItem[] = [];
  const plugins: ClientPluginSummary[] = [];
  const definitions = loadPlugins(root, connections, errors, menus, plugins);
  menus.sort((a, b) => a.group < b.group ? -1 : a.group > b.group ? 1 : a.order - b.order || (a.title < b.title ? -1 : a.title > b.title ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return errors.length > 0 ? { ok: false, errors } : { ok: true, definitions, menus, plugins };
}

const loadModule = createRequire(__filename);

export async function preflightConfiguration(rootDirectory: string): Promise<ConfigurationResult> {
  const result = validateRepository(rootDirectory);
  if (!result.ok) return result;
  const errors: ConfigurationIssue[] = [];
  for (const definition of result.definitions) {
    try {
      const loaded = loadModule(definition.plugin.transformPath) as { transform?: unknown };
      if (typeof loaded.transform !== 'function') {
        issue(errors, resolve(rootDirectory), definition.plugin.transformPath, '/transform', `plugin ${definition.plugin.id} must export transform`);
      }
    } catch {
      issue(errors, resolve(rootDirectory), definition.plugin.transformPath, '/transform', `plugin ${definition.plugin.id} module cannot be loaded`);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : result;
}
