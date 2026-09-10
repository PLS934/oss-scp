import { readPlatformDbConfig } from './config';
import { selectPlatformDbAdapter } from './adapters';
import { defaultMigrationsDirectory, discoverMigrations, runMysqlMigrations, runPostgresMigrations } from './migrations';
import { mysqlAdapter, type MysqlPlatformDbConnection } from './mysql';
import { postgresAdapter, type PostgresPlatformDbConnection } from './postgres';

async function main() {
  const adapters = [postgresAdapter, mysqlAdapter] as const;
  const config = readPlatformDbConfig(process.env, adapters);
  const adapter = selectPlatformDbAdapter(config.type, adapters);
  const connection = await adapter.connect(config);
  try {
    const migrations = discoverMigrations(defaultMigrationsDirectory(config.type as 'postgres' | 'mysql'));
    const applied = config.type === 'postgres'
      ? await runPostgresMigrations(connection as PostgresPlatformDbConnection, migrations, config.connectTimeoutMs)
      : await runMysqlMigrations(connection as MysqlPlatformDbConnection, migrations, config.connectTimeoutMs);
    console.log(`migration 완료: ${applied}개 적용`);
  } finally { await connection.close(); }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'migration 적용에 실패했습니다.');
  process.exitCode = 1;
});
