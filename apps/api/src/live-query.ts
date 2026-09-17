import { createRequire } from 'node:module';
import { join } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { QueryError, numberedPageInfo, type JsonValue, type NormalizedListRecordsInput } from '@oss-scp/platform-db';
import { isLivePostgresDefinition, resolveSecret, type LivePostgresDefinition } from '@oss-scp/plugin-config';
import type { PluginRuntimeRegistry } from './plugin-runtime-registry';

const localRequire = createRequire(__filename);
export const LIVE_QUERY = Symbol('LIVE_QUERY');
const quote = (identifier: string): string => `"${identifier}"`;
const escapeLike = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');

export interface LiveRecord {
  mode: 'live'; id: string; pluginId: string; sourceId: string; dataType: string; externalKey: string | number; sourceValues: Record<string, JsonValue>;
}
export interface LiveListResult {
  mode: 'live'; items: Array<LiveRecord & { omittedFields: string[] }>;
  pageInfo: ReturnType<typeof numberedPageInfo>; queriedAt: string;
}

type CacheEntry = { expiresAt: number; bytes: number; value: LiveListResult };

function jsonRecord(value: unknown): value is Record<string, JsonValue> {
  try { return value !== null && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(value) !== undefined; } catch { return false; }
}

function fieldExpression(definition: LivePostgresDefinition, field: string): string {
  const mapped = definition.source.queryFields[field];
  if (!mapped) throw new QueryError('INVALID_QUERY');
  return `live_source.${quote(mapped.column)}`;
}

function buildConditions(definition: LivePostgresDefinition, input: NormalizedListRecordsInput): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const bind = (value: unknown): string => { values.push(value); return `$${values.length}`; };
  const predicates: string[] = [];
  const conditions = input.conditions;
  if (conditions?.q) {
    const pattern = `%${escapeLike(conditions.q)}%`;
    predicates.push(`(${conditions.declaration.searchFields.map(field => `${fieldExpression(definition, field)}::text ILIKE ${bind(pattern)} ESCAPE '\\'`).join(' OR ')})`);
  }
  for (const filter of conditions?.filters ?? []) {
    const column = fieldExpression(definition, filter.field);
    if (filter.kind === 'select') predicates.push(`${column} = ${bind(filter.value)}`);
    else if (filter.kind === 'multiSelect') predicates.push(`(${filter.values.map(value => `${column} = ${bind(value)}`).join(' OR ')})`);
    else if (filter.kind === 'numberRange') {
      if (filter.min !== undefined) predicates.push(`${column}::numeric >= ${bind(filter.min)}`);
      if (filter.max !== undefined) predicates.push(`${column}::numeric <= ${bind(filter.max)}`);
    } else {
      if (filter.from !== undefined) predicates.push(`${column}::timestamptz >= ${bind(`${filter.from}T00:00:00.000Z`)}`);
      if (filter.to !== undefined) predicates.push(`${column}::timestamptz < (${bind(`${filter.to}T00:00:00.000Z`)}::timestamptz + interval '1 day')`);
    }
  }
  return { sql: predicates.length ? ` WHERE ${predicates.join(' AND ')}` : '', values };
}

function querySql(definition: LivePostgresDefinition, input: NormalizedListRecordsInput): { count: string; page: string; values: unknown[] } {
  const conditions = buildConditions(definition, input);
  const source = `(${definition.source.listQuery}) AS live_source`;
  const key = `live_source.${quote(definition.source.externalKeyColumn)}`;
  const direction = input.sort?.direction.toUpperCase() ?? 'ASC';
  const primary = input.sort ? `${fieldExpression(definition, input.sort.field)} ${direction} NULLS LAST, ` : '';
  const offset = (input.page! - 1) * input.limit;
  const limitBind = `$${conditions.values.length + 1}`;
  const offsetBind = `$${conditions.values.length + 2}`;
  return {
    count: `SELECT COUNT(*)::text AS total FROM ${source}${conditions.sql}`,
    page: `SELECT * FROM ${source}${conditions.sql} ORDER BY ${primary}${key} ASC LIMIT ${limitBind} OFFSET ${offsetBind}`,
    values: [...conditions.values, input.limit, offset],
  };
}

export class LiveQueryManager {
  private readonly pools = new Map<string, Pool>();
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<LiveListResult>>();
  private cacheBytes = 0;

  constructor(private readonly registry: PluginRuntimeRegistry, private readonly now: () => number = Date.now) {}

  private definition(pluginId: string, sourceId: string, dataType: string): LivePostgresDefinition {
    const found = this.registry.getDefinition(pluginId);
    if (!found || !isLivePostgresDefinition(found) || found.connection.id !== sourceId || !(dataType in found.plugin.data.types)) throw new QueryError('INVALID_QUERY');
    return found;
  }

  private pool(definition: LivePostgresDefinition): Pool {
    const id = definition.connection.id;
    const existing = this.pools.get(id);
    if (existing) return existing;
    const config = definition.connection.config;
    const password = resolveSecret(config.passwordRef, { secretRoot: this.registry.configRoot ? join(this.registry.configRoot, 'secrets') : undefined });
    const pool = new Pool({ host: config.host, port: config.port, database: config.database, user: config.user, password, ssl: config.ssl === 'require' ? { rejectUnauthorized: true } : false, max: 5, connectionTimeoutMillis: definition.source.limits.timeoutMs, query_timeout: definition.source.limits.timeoutMs, idleTimeoutMillis: 30_000 });
    this.pools.set(id, pool);
    return pool;
  }

  private async transaction<T>(definition: LivePostgresDefinition, run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool(definition).connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query(`SET LOCAL statement_timeout = ${definition.source.limits.timeoutMs}`);
      const value = await run(client);
      await client.query('COMMIT');
      return value;
    } catch {
      try { await client.query('ROLLBACK'); } catch { throw new QueryError('QUERY_FAILED'); }
      throw new QueryError('QUERY_FAILED');
    } finally { client.release(); }
  }

  private async transform(definition: LivePostgresDefinition, dataType: string, row: Record<string, unknown>): Promise<LiveRecord> {
    const externalKey = row[definition.source.externalKeyColumn];
    if (typeof externalKey !== 'string' && typeof externalKey !== 'number') throw new QueryError('QUERY_FAILED');
    const loaded = localRequire(definition.plugin.transformPath) as { transform?: (input: unknown) => unknown };
    if (typeof loaded.transform !== 'function') throw new QueryError('QUERY_FAILED');
    const output = await loaded.transform({ record: row, context: { pluginId: definition.plugin.id, sourceId: definition.connection.id, collectedAt: new Date(this.now()).toISOString(), signal: new AbortController().signal } }) as { records?: Array<{ type?: unknown; values?: unknown }>; relations?: unknown[] };
    if (!Array.isArray(output?.records) || output.records.length !== 1 || output.relations?.length || output.records[0]?.type !== dataType || !jsonRecord(output.records[0]?.values)) throw new QueryError('QUERY_FAILED');
    const values = output.records[0].values;
    if (values[definition.source.externalKeyColumn] !== externalKey || Object.entries(definition.source.queryFields).some(([field, mapping]) => values[field] !== row[mapping.column])) throw new QueryError('QUERY_FAILED');
    return { mode: 'live', id: String(externalKey), pluginId: definition.plugin.id, sourceId: definition.connection.id, dataType, externalKey, sourceValues: values };
  }

  async list(pluginId: string, sourceId: string, dataType: string, input: NormalizedListRecordsInput, revision: string): Promise<LiveListResult> {
    const definition = this.definition(pluginId, sourceId, dataType);
    if (input.page === undefined || input.limit > definition.source.limits.rowCap) throw new QueryError('INVALID_QUERY');
    const key = JSON.stringify([revision, pluginId, sourceId, dataType, input]);
    if (definition.source.cache) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > this.now()) return cached.value;
      const active = this.pending.get(key); if (active) return active;
    }
    const execute = this.executeList(definition, dataType, input);
    if (!definition.source.cache) return execute;
    this.pending.set(key, execute);
    try {
      const value = await execute; const bytes = Buffer.byteLength(JSON.stringify(value));
      while (this.cache.size >= 100 || this.cacheBytes + bytes > 16 * 1024 * 1024) { const oldest = this.cache.keys().next().value as string | undefined; if (!oldest) break; this.cacheBytes -= this.cache.get(oldest)!.bytes; this.cache.delete(oldest); }
      this.cache.set(key, { value, bytes, expiresAt: this.now() + definition.source.cache.ttlSeconds * 1000 }); this.cacheBytes += bytes;
      return value;
    } finally { this.pending.delete(key); }
  }

  private async executeList(definition: LivePostgresDefinition, dataType: string, input: NormalizedListRecordsInput): Promise<LiveListResult> {
    const sql = querySql(definition, input);
    return this.transaction(definition, async client => {
      const countResult = await client.query(sql.count, sql.values.slice(0, -2));
      const pageInfo = numberedPageInfo(countResult.rows[0]?.total, input.page!, input.limit);
      const pageInput = pageInfo.page === input.page ? sql : querySql(definition, { ...input, page: pageInfo.page });
      const rows = await client.query(pageInput.page, pageInput.values);
      const items = await Promise.all(rows.rows.map(async row => ({ ...await this.transform(definition, dataType, row), omittedFields: [] })));
      const value: LiveListResult = { mode: 'live', items, pageInfo, queriedAt: new Date(this.now()).toISOString() };
      if (Buffer.byteLength(JSON.stringify(value)) > definition.source.limits.maxResponseBytes) throw new QueryError('QUERY_FAILED');
      return value;
    });
  }

  async detail(pluginId: string, sourceId: string, dataType: string, externalKey: string): Promise<LiveRecord | null> {
    const definition = this.definition(pluginId, sourceId, dataType);
    return this.transaction(definition, async client => {
      const result = await client.query(`SELECT * FROM (${definition.source.detailQuery}) AS live_detail LIMIT 2`, [externalKey]);
      if (result.rows.length > 1) throw new QueryError('QUERY_FAILED');
      return result.rows[0] ? await this.transform(definition, dataType, result.rows[0]) : null;
    });
  }

  async close(): Promise<void> { await Promise.all([...this.pools.values()].map(pool => pool.end())); }
}
