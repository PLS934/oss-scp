import type {
  CollectionDefinitionBase,
  OffsetCollectionDefinition,
  OffsetSourceConfig,
} from '../types';

export function loadOffsetSource(
  base: CollectionDefinitionBase,
  source: OffsetSourceConfig,
): OffsetCollectionDefinition {
  return {
    ...base,
    limits: source.limits,
    response: {
      itemsPath: source.itemsPath,
      totalPath: source.pagination.totalPath,
      ...(source.metadataPaths ? { metadataPaths: source.metadataPaths } : {}),
    },
    pagination: {
      type: 'offset',
      offsetParam: source.pagination.offsetParam,
      limitParam: source.pagination.limitParam,
      start: source.pagination.start,
      limit: source.pagination.limit,
    },
  };
}
