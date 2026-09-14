import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { readConfig } from './config';
import { createPlatformRecordAdapters, mysqlAdapter, postgresAdapter, readPlatformDbConfig, selectPlatformDbAdapter } from '@oss-scp/platform-db';
import { preflightConfiguration } from '@oss-scp/plugin-config';
import { formatConfigurationIssues } from './configuration-errors';
import { createPluginRuntimeRegistry } from './plugin-runtime-registry';
import { StartupCollectionManager } from './startup-collection';

async function bootstrap() {
  const envFile = resolve(__dirname, '../../../.env');
  if (existsSync(envFile)) loadEnvFile(envFile);
  const { host, port, configRoot } = readConfig();
  const configuration = await preflightConfiguration(configRoot);
  if (!configuration.ok) {
    throw new Error(`플러그인 설정 검증 실패\n${formatConfigurationIssues(configuration.errors)}`);
  }
  const registry = createPluginRuntimeRegistry({ ...configuration, configRoot });
  const adapters = [postgresAdapter, mysqlAdapter] as const;
  const dbConfig = readPlatformDbConfig(process.env, adapters);
  const connection = await selectPlatformDbAdapter(dbConfig.type, adapters).connect(dbConfig);
  const { query } = createPlatformRecordAdapters(dbConfig.type, connection);
  const startup = new StartupCollectionManager(configRoot);
  const app = await NestFactory.create(AppModule.register(connection, query, registry, startup), { abortOnError: false });
  app.enableShutdownHooks();
  try {
    await app.listen(port, host);
    startup.start(registry.definitions);
  } catch (error) {
    await app.close();
    await connection.close();
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  console.error('서버 시작 실패:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
