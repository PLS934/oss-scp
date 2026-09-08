import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { readConfig } from './config';

async function bootstrap() {
  const envFile = resolve(__dirname, '../../../.env');
  if (existsSync(envFile)) loadEnvFile(envFile);
  const { host, port } = readConfig();
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  app.enableShutdownHooks();
  try {
    await app.listen(port, host);
  } catch (error) {
    await app.close();
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  console.error('서버 시작 실패:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
