import { DynamicModule, Module, OnApplicationShutdown } from '@nestjs/common';
import type { PlatformDbConnection, RecordQuery } from '@oss-scp/platform-db';
import { HealthController } from './health.controller';
import { HealthService, PLATFORM_DB_CONNECTION } from './health.service';
import { RecordQueryController } from './record-query.controller';
import { RECORD_QUERY, RecordQueryService } from './record-query.service';
import { PluginMenuController } from './plugin-menu.controller';
import { createPluginRuntimeRegistry, PLUGIN_RUNTIME_REGISTRY, type PluginRuntimeRegistry } from './plugin-runtime-registry';
import { CollectionStatusController } from './collection-status.controller';
import { CollectionStatusService } from './collection-status.service';
import type { StartupCollectionManager } from './startup-collection';

class PlatformDbLifecycle implements OnApplicationShutdown {
  constructor(private readonly connection: PlatformDbConnection, private readonly startup?: StartupCollectionManager) {}
  async onApplicationShutdown() { await this.startup?.close(); await this.connection.close(); }
}

@Module({})
export class AppModule {
  static register(
    connection: PlatformDbConnection,
    query?: RecordQuery,
    registry: PluginRuntimeRegistry = createPluginRuntimeRegistry({ definitions: [], menus: [] }),
    startup?: StartupCollectionManager,
  ): DynamicModule {
    const unavailable: RecordQuery = {
      listRecords: async () => { throw new Error('record query adapter unavailable'); },
      getRecord: async () => { throw new Error('record query adapter unavailable'); },
    };
    return {
      module: AppModule,
      controllers: [HealthController, RecordQueryController, PluginMenuController, CollectionStatusController],
      providers: [
        { provide: PLATFORM_DB_CONNECTION, useValue: connection },
        { provide: RECORD_QUERY, useValue: query ?? unavailable },
        { provide: PLUGIN_RUNTIME_REGISTRY, useValue: registry },
        HealthService,
        RecordQueryService,
        CollectionStatusService,
        { provide: PlatformDbLifecycle, useFactory: () => new PlatformDbLifecycle(connection, startup) },
      ],
      exports: [PLUGIN_RUNTIME_REGISTRY],
    };
  }
}
