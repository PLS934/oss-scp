import type {
  LocalCsvCollectionDefinition,
  LocalCsvSourceConfig,
  PluginConfig,
} from '../types';

export function loadLocalCsvSource(
  plugin: PluginConfig,
  source: LocalCsvSourceConfig,
  path: string,
): LocalCsvCollectionDefinition {
  return {
    plugin: { id: plugin.id, name: plugin.name, version: plugin.version },
    source: { transport: 'file', format: 'csv', path },
    batching: { size: source.batchSize },
    limits: {
      ...(source.maxBytes === undefined ? {} : { maxBytes: source.maxBytes }),
      ...(source.maxRecordSize === undefined
        ? {}
        : { maxRecordSize: source.maxRecordSize }),
    },
  };
}
