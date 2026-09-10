import { DynamicModule, Module, OnApplicationShutdown } from '@nestjs/common';
import type { PlatformDbConnection } from '@oss-scp/platform-db';
import { HealthController } from './health.controller';
import { HealthService, PLATFORM_DB_CONNECTION } from './health.service';

class PlatformDbLifecycle implements OnApplicationShutdown {
  constructor(private readonly connection: PlatformDbConnection) {}
  onApplicationShutdown() { return this.connection.close(); }
}

@Module({})
export class AppModule {
  static register(connection: PlatformDbConnection): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [
        { provide: PLATFORM_DB_CONNECTION, useValue: connection },
        HealthService,
        { provide: PlatformDbLifecycle, useFactory: () => new PlatformDbLifecycle(connection) },
      ],
    };
  }
}
