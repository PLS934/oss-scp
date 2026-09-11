import type {
  HttpConnectionConfig,
  HttpCsvCollectionDefinition,
  HttpCsvSourceConfig,
  PluginRuntimeDefinition,
} from '../types';

export function loadHttpCsvSource(
  plugin: PluginRuntimeDefinition,
  source: HttpCsvSourceConfig,
  connection: HttpConnectionConfig,
): HttpCsvCollectionDefinition {
  return {
    plugin,
    connection: { id: connection.id, baseUrl: connection.config.baseUrl },
    request: {
      transport: 'http',
      method: source.method,
      path: source.path,
      format: source.format,
    },
    batching: { size: source.batchSize },
    limits: source.limits,
  };
}
