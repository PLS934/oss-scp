import { loadOffsetSource } from './source-loaders/offset';
import { loadSingleSource } from './source-loaders/single';
import type {
  CollectionDefinition,
  CollectionDefinitionBase,
  OffsetSourceConfig,
  SingleSourceConfig,
} from './types';

type HttpSourceConfig = OffsetSourceConfig | SingleSourceConfig;

function isOffsetSource(source: HttpSourceConfig): source is OffsetSourceConfig {
  return source.pagination.type === 'offset';
}

function isSingleSource(source: HttpSourceConfig): source is SingleSourceConfig {
  return source.pagination.type === 'single';
}

export function loadSourceDefinition(
  base: CollectionDefinitionBase,
  source: HttpSourceConfig,
): CollectionDefinition {
  if (isOffsetSource(source)) return loadOffsetSource(base, source);
  if (isSingleSource(source)) return loadSingleSource(base, source);
  return source satisfies never;
}
