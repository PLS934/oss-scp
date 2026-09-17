import { parse } from 'pgsql-ast-parser';
import type { LivePostgresDefinition, PluginRuntimeDefinition, PostgresConnectionConfig, PostgresSourceConfig } from '../types';

type AstNode = { type?: string; bind?: Array<{ statement: AstNode }>; in?: AstNode; left?: AstNode; right?: AstNode; for?: unknown };

function readonlyStatement(statement: AstNode): boolean {
  if (statement.type === 'select') return statement.for === undefined;
  if (statement.type === 'union' || statement.type === 'union all') return Boolean(statement.left && statement.right && readonlyStatement(statement.left) && readonlyStatement(statement.right));
  if (statement.type === 'with') return Boolean(statement.bind?.every(item => readonlyStatement(item.statement)) && statement.in && readonlyStatement(statement.in));
  if (statement.type === 'with recursive') return Boolean(statement.bind && readonlyStatement(statement.bind as unknown as AstNode) && statement.in && readonlyStatement(statement.in));
  return false;
}

export function validateReadQuery(sql: string, detail = false): void {
  let statements: AstNode[];
  try { statements = parse(sql) as AstNode[]; } catch { throw new Error('query must be valid PostgreSQL SQL'); }
  if (statements.length !== 1 || !statements[0] || !readonlyStatement(statements[0])) throw new Error('query must be one read-only SELECT or WITH statement');
  const placeholders = [...sql.matchAll(/\$(\d+)/g)].map(match => Number(match[1]));
  if (detail ? placeholders.some(value => value !== 1) || !placeholders.includes(1) : placeholders.length > 0) {
    throw new Error(detail ? 'detailQuery may use only the $1 external-key parameter' : 'listQuery must not contain parameters');
  }
}

export function loadPostgresSource(plugin: PluginRuntimeDefinition, source: PostgresSourceConfig, connection: PostgresConnectionConfig): LivePostgresDefinition {
  validateReadQuery(source.listQuery);
  validateReadQuery(source.detailQuery, true);
  return { plugin, mode: 'live', persistence: 'none', connection, source };
}

export function isLivePostgresDefinition(value: unknown): value is LivePostgresDefinition {
  return typeof value === 'object' && value !== null && 'mode' in value && value.mode === 'live';
}
