import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PostgresPlatformDbConnection } from './postgres';
import type { MysqlPlatformDbConnection } from './mysql';

export interface Migration { version: number; name: string; checksum: string; sql: string }

export class MigrationError extends Error {
  constructor(readonly code: 'INVALID_MIGRATION' | 'CHECKSUM_MISMATCH' | 'MIGRATION_FAILED' | 'LOCK_TIMEOUT') {
    super({
      INVALID_MIGRATION: 'migration 파일 이름과 버전을 확인하세요.',
      CHECKSUM_MISMATCH: '적용된 migration의 checksum이 다릅니다.',
      MIGRATION_FAILED: 'migration 적용에 실패했습니다.',
      LOCK_TIMEOUT: 'migration 잠금을 제한 시간 안에 얻지 못했습니다.',
    }[code]);
    this.name = 'MigrationError';
  }
}

export function discoverMigrations(directory: string): Migration[] {
  const migrations = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
    .map(entry => {
      const match = /^(\d{4})-([a-z0-9-]+)\.sql$/.exec(entry.name);
      if (!match) throw new MigrationError('INVALID_MIGRATION');
      const sql = readFileSync(join(directory, entry.name), 'utf8');
      return { version: Number(match[1]), name: match[2], sql, checksum: createHash('sha256').update(sql).digest('hex') };
    }).sort((a, b) => a.version - b.version);
  if (new Set(migrations.map(item => item.version)).size !== migrations.length) throw new MigrationError('INVALID_MIGRATION');
  return migrations;
}

export async function runPostgresMigrations(connection: PostgresPlatformDbConnection, migrations: readonly Migration[], lockTimeoutMs: number): Promise<number> {
  return connection.withClient(async client => {
    await client.query(`CREATE TABLE IF NOT EXISTS oss_scp_schema_migrations (
      version integer PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`SET statement_timeout = '${Math.max(1, lockTimeoutMs)}ms'`);
    try { await client.query("SELECT pg_advisory_lock(hashtext('oss-scp-platform-migrations'))"); }
    catch { throw new MigrationError('LOCK_TIMEOUT'); }
    await client.query('SET statement_timeout = 0');
    let applied = 0;
    try {
      const existing = await client.query<{ version: number; checksum: string }>('SELECT version, checksum FROM oss_scp_schema_migrations ORDER BY version');
      const checksums = new Map(existing.rows.map(row => [row.version, row.checksum]));
      for (const migration of migrations) {
        const checksum = checksums.get(migration.version);
        if (checksum !== undefined) {
          if (checksum !== migration.checksum) throw new MigrationError('CHECKSUM_MISMATCH');
          continue;
        }
        try {
          await client.query('BEGIN');
          await client.query(migration.sql);
          await client.query('INSERT INTO oss_scp_schema_migrations(version, name, checksum) VALUES ($1, $2, $3)', [migration.version, migration.name, migration.checksum]);
          await client.query('COMMIT');
          applied++;
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          if (error instanceof MigrationError) throw error;
          throw new MigrationError('MIGRATION_FAILED');
        }
      }
      return applied;
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('oss-scp-platform-migrations'))").catch(() => undefined);
    }
  });
}

/** 기존 공개 API를 유지한다. */
export const runMigrations = runPostgresMigrations;

export async function runMysqlMigrations(connection: MysqlPlatformDbConnection, migrations: readonly Migration[], lockTimeoutMs: number): Promise<number> {
  return connection.withClient(async client => {
    await client.query(`CREATE TABLE IF NOT EXISTS oss_scp_schema_migrations (
      version integer PRIMARY KEY, name varchar(255) NOT NULL, checksum char(64) NOT NULL,
      applied_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB`);
    let locked = false;
    try {
      const [lockRows] = await client.query('SELECT GET_LOCK(?, ?) AS acquired', [
        'oss-scp-platform-migrations', Math.max(1, Math.ceil(lockTimeoutMs / 1000)),
      ]) as [{ acquired: number | null }[], unknown];
      locked = lockRows[0]?.acquired === 1;
      if (!locked) throw new MigrationError('LOCK_TIMEOUT');

      const [rows] = await client.query('SELECT version, checksum FROM oss_scp_schema_migrations ORDER BY version') as [{ version: number; checksum: string }[], unknown];
      const checksums = new Map(rows.map(row => [row.version, row.checksum]));
      let applied = 0;
      for (const migration of migrations) {
        const checksum = checksums.get(migration.version);
        if (checksum !== undefined) {
          if (checksum !== migration.checksum) throw new MigrationError('CHECKSUM_MISMATCH');
          continue;
        }
        try {
          await client.query(migration.sql);
          await client.query('INSERT INTO oss_scp_schema_migrations(version, name, checksum) VALUES (?, ?, ?)', [migration.version, migration.name, migration.checksum]);
          applied++;
        } catch (error) {
          if (error instanceof MigrationError) throw error;
          throw new MigrationError('MIGRATION_FAILED');
        }
      }
      return applied;
    } finally {
      if (locked) await client.query('SELECT RELEASE_LOCK(?)', ['oss-scp-platform-migrations']).catch(() => undefined);
    }
  });
}

export function defaultMigrationsDirectory(type: 'postgres' | 'mysql' = 'postgres'): string {
  return join(__dirname, '..', 'migrations', type);
}
