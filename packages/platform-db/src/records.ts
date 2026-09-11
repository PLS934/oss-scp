import type { PlatformDbConnection } from './types';
import type { MysqlPlatformDbConnection } from './mysql';
import type { PostgresPlatformDbConnection } from './postgres';
import { createMysqlRecordQuery } from './mysql-query';
import { createMysqlRecordStorage } from './mysql-storage';
import { createPostgresRecordQuery } from './postgres-query';
import { createPostgresRecordStorage } from './postgres-storage';
import type { RecordQuery } from './query';
import type { RecordStorage } from './storage';
import { PlatformDbConfigError } from './errors';

export interface PlatformRecordAdapters { storage: RecordStorage; query: RecordQuery }

export function createPlatformRecordAdapters(type: string, connection: PlatformDbConnection): PlatformRecordAdapters {
  if (type === 'postgres') {
    const postgres = connection as PostgresPlatformDbConnection;
    return { storage: createPostgresRecordStorage(postgres), query: createPostgresRecordQuery(postgres) };
  }
  if (type === 'mysql') {
    const mysql = connection as MysqlPlatformDbConnection;
    return { storage: createMysqlRecordStorage(mysql), query: createMysqlRecordQuery(mysql) };
  }
  throw new PlatformDbConfigError('UNREGISTERED_ADAPTER', 'PLATFORM_DB_TYPE');
}
