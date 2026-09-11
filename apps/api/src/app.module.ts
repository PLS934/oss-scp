import { DynamicModule, Module, OnApplicationShutdown } from '@nestjs/common';
import type { PlatformDbConnection, RecordQuery } from '@oss-scp/platform-db';
import { HealthController } from './health.controller';
import { HealthService, PLATFORM_DB_CONNECTION } from './health.service';
import { RecordQueryController } from './record-query.controller';
import { RECORD_QUERY, RecordQueryService } from './record-query.service';

class PlatformDbLifecycle implements OnApplicationShutdown {
  constructor(private readonly connection: PlatformDbConnection) {}
  onApplicationShutdown() { return this.connection.close(); }
}

@Module({})
export class AppModule {
  static register(connection: PlatformDbConnection, query?: RecordQuery): DynamicModule {
    const unavailable: RecordQuery = {
      listRecords: async () => { throw new Error('record query adapter unavailable'); },
      getRecord: async () => { throw new Error('record query adapter unavailable'); },
    };
    return {
      module: AppModule,
      controllers: [HealthController, RecordQueryController],
      providers: [
        { provide: PLATFORM_DB_CONNECTION, useValue: connection },
        { provide: RECORD_QUERY, useValue: query ?? unavailable },
        HealthService,
        RecordQueryService,
        { provide: PlatformDbLifecycle, useFactory: () => new PlatformDbLifecycle(connection) },
      ],
    };
  }
}
