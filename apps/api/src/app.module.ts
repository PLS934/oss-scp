import { DynamicModule, Module, OnApplicationShutdown } from '@nestjs/common';
import type { PlatformDbConnection, RecordQuery } from '@oss-scp/platform-db';
import { HealthController } from './health.controller';
import { HealthService, PLATFORM_DB_CONNECTION } from './health.service';
import { RecordQueryController } from './record-query.controller';
import { RECORD_QUERY, RecordQueryService } from './record-query.service';
import { PLUGIN_MENUS, PluginMenuController } from './plugin-menu.controller';
import type { ClientMenuItem } from '@oss-scp/plugin-config';

class PlatformDbLifecycle implements OnApplicationShutdown {
  constructor(private readonly connection: PlatformDbConnection) {}
  onApplicationShutdown() { return this.connection.close(); }
}

@Module({})
export class AppModule {
  static register(connection: PlatformDbConnection, query?: RecordQuery, menus: readonly ClientMenuItem[] = []): DynamicModule {
    const unavailable: RecordQuery = {
      listRecords: async () => { throw new Error('record query adapter unavailable'); },
      getRecord: async () => { throw new Error('record query adapter unavailable'); },
    };
    return {
      module: AppModule,
      controllers: [HealthController, RecordQueryController, PluginMenuController],
      providers: [
        { provide: PLATFORM_DB_CONNECTION, useValue: connection },
        { provide: RECORD_QUERY, useValue: query ?? unavailable },
        { provide: PLUGIN_MENUS, useValue: menus },
        HealthService,
        RecordQueryService,
        { provide: PlatformDbLifecycle, useFactory: () => new PlatformDbLifecycle(connection) },
      ],
    };
  }
}
