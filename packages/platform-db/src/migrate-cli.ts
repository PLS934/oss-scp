import { readPlatformDbConfig } from './config';
import { defaultMigrationsDirectory, discoverMigrations, runMigrations } from './migrations';
import { postgresAdapter, type PostgresPlatformDbConnection } from './postgres';

async function main() {
  const config = readPlatformDbConfig(process.env, [postgresAdapter]);
  const connection = await postgresAdapter.connect(config) as PostgresPlatformDbConnection;
  try {
    const applied = await runMigrations(connection, discoverMigrations(defaultMigrationsDirectory()), config.connectTimeoutMs);
    console.log(`migration 완료: ${applied}개 적용`);
  } finally { await connection.close(); }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'migration 적용에 실패했습니다.');
  process.exitCode = 1;
});
