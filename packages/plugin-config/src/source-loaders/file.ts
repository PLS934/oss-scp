import type {
  LocalCsvCollectionDefinition,
  LocalCsvSourceConfig,
  PluginRuntimeDefinition,
} from '../types';

export function loadLocalCsvSource(
  plugin: PluginRuntimeDefinition,
  source: LocalCsvSourceConfig,
  path: string,
): LocalCsvCollectionDefinition {
  return {
    plugin,
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
