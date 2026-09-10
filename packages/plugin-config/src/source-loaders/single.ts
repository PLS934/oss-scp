import type {
  CollectionDefinitionBase,
  SingleCollectionDefinition,
  SingleSourceConfig,
} from '../types';

export function loadSingleSource(
  base: CollectionDefinitionBase,
  source: SingleSourceConfig,
): SingleCollectionDefinition {
  return {
    ...base,
    response: { itemsPath: source.itemsPath, ...(source.metadataPaths ? { metadataPaths: source.metadataPaths } : {}) },
    pagination: { type: 'single' },
  };
}
