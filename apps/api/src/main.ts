import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { readConfig } from './config';
import { createPlatformRecordAdapters, mysqlAdapter, postgresAdapter, readPlatformDbConfig, selectPlatformDbAdapter } from '@oss-scp/platform-db';
import { preflightConfiguration } from '@oss-scp/plugin-config';

async function bootstrap() {
  const envFile = resolve(__dirname, '../../../.env');
  if (existsSync(envFile)) loadEnvFile(envFile);
  const { host, port, configRoot } = readConfig();
  const configuration = await preflightConfiguration(configRoot);
  if (!configuration.ok) throw new Error('플러그인 설정 검증 실패');
  const adapters = [postgresAdapter, mysqlAdapter] as const;
  const dbConfig = readPlatformDbConfig(process.env, adapters);
  const connection = await selectPlatformDbAdapter(dbConfig.type, adapters).connect(dbConfig);
  const { query } = createPlatformRecordAdapters(dbConfig.type, connection);
  const app = await NestFactory.create(AppModule.register(connection, query, configuration.menus), { abortOnError: false });
  app.enableShutdownHooks();
  try {
    await app.listen(port, host);
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
