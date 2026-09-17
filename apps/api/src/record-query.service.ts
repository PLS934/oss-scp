import { definitionRevision, PLUGIN_RUNTIME_REGISTRY, type PluginRuntimeRegistry } from './plugin-runtime-registry';
import { Inject, Injectable } from '@nestjs/common';
import { normalizeRecordConditions, QueryError, validateListRecordsInput, type QueryDeclaration } from '@oss-scp/platform-db';
import type { AnyListRecordsResult, QueryRecord, RecordQuery, RecordSortType } from '@oss-scp/platform-db';
import { isLivePostgresDefinition } from '@oss-scp/plugin-config';
import { LIVE_QUERY, type LiveListResult, type LiveQueryManager, type LiveRecord } from './live-query';

export const RECORD_QUERY = Symbol('RECORD_QUERY');

@Injectable()
export class RecordQueryService {
  constructor(@Inject(RECORD_QUERY) private readonly query: RecordQuery, @Inject(PLUGIN_RUNTIME_REGISTRY) private readonly registry: PluginRuntimeRegistry, @Inject(LIVE_QUERY) private readonly live: LiveQueryManager) {}
  list(pluginId: string | undefined, sourceId: string | undefined, dataType: string | undefined, rawLimit: string | undefined, cursor: string | undefined, rawPage?: string, rawQ?: unknown, rawFilters?: unknown, rawSort?: unknown, rawDirection?: unknown): Promise<AnyListRecordsResult | LiveListResult> {
    if ([pluginId, sourceId, dataType, rawLimit, cursor].some(value => value !== undefined && typeof value !== 'string')) throw new QueryError('INVALID_QUERY');
    if (rawFilters !== undefined && typeof rawFilters !== 'string') throw new QueryError('INVALID_QUERY');
    if (rawPage !== undefined && (typeof rawPage !== 'string' || !/^\d+$/.test(rawPage))) throw new QueryError('INVALID_QUERY');
    if ((rawSort === undefined) !== (rawDirection === undefined) || (rawSort !== undefined && (typeof rawSort !== 'string' || typeof rawDirection !== 'string' || !['asc', 'desc'].includes(rawDirection)))) throw new QueryError('INVALID_QUERY');
    let page = rawPage === undefined ? undefined : Number(rawPage);
    const limit = rawLimit === undefined ? undefined : /^\d+$/.test(rawLimit) ? Number(rawLimit) : Number.NaN;
    const definition = pluginId ? this.registry.getDefinition(pluginId) : undefined;
    const liveDefinition = definition && isLivePostgresDefinition(definition) ? definition : undefined;
    if (liveDefinition && rawPage === undefined) page = 1;
    const matchingSource = this.registry.menus.some(menu => menu.pluginId === pluginId && menu.sourceId === sourceId);
    const type = definition && matchingSource && dataType && Object.hasOwn(definition.plugin.data.types, dataType) ? definition.plugin.data.types[dataType] : undefined;
    const declaration: QueryDeclaration = { searchFields: [], filters: [] };
    if (type) {
      declaration.searchFields = Object.entries(type.fields).filter(([key, field]) => field.type === 'string' && field.searchable && type.views.list.columns.includes(key)).map(([key]) => key);
      declaration.filters = Object.entries(type.fields).flatMap(([key, field]) => field.type !== 'object' && field.type !== 'array' && field.filter && type.views.list.columns.includes(key) ? [{ key, type: field.type, ...field.filter }] : []);
    }
    const sortField = typeof rawSort === 'string' && type ? Object.entries(type.fields).find(([key, field]) => key === rawSort && field.type !== 'object' && field.type !== 'array' && field.sortable && type.views.list.columns.includes(key)) : undefined;
    if (rawSort !== undefined && (!sortField || page === undefined || cursor !== undefined)) throw new QueryError('INVALID_QUERY');
    const sort = sortField ? { field: sortField[0], type: sortField[1].type as RecordSortType, direction: rawDirection as 'asc' | 'desc' } : undefined;
    const conditions = normalizeRecordConditions(rawQ, rawFilters, declaration);
    const input = { pluginId: pluginId ?? '', sourceId: sourceId ?? '', dataType: dataType ?? '', ...(limit === undefined ? {} : { limit }), ...(cursor === undefined ? {} : { cursor }), ...(page === undefined ? {} : { page }), ...(sort ? { sort } : {}), ...(conditions.q || conditions.filters.length || declaration.searchFields.length || declaration.filters.length ? { conditions } : {}) };
    const normalized = validateListRecordsInput(input);
    if (liveDefinition) {
      if (cursor !== undefined || sourceId !== liveDefinition.connection.id) throw new QueryError('INVALID_QUERY');
      return this.live.list(pluginId!, sourceId!, dataType!, normalized, definitionRevision(liveDefinition));
    }
    return this.query.listRecords(input);
  }
  get(id: string): Promise<QueryRecord | null> { return this.query.getRecord(id); }
  getLive(pluginId: string, sourceId: string, dataType: string, externalKey: string): Promise<LiveRecord | null> {
    if (![pluginId, sourceId, dataType, externalKey].every(value => typeof value === 'string' && value.length > 0 && !value.includes('\0'))) throw new QueryError('INVALID_QUERY');
    return this.live.detail(pluginId, sourceId, dataType, externalKey);
  }
}
