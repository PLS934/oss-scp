import { DynamicModule, Module, OnApplicationShutdown } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { PlatformDbConnection, RecordQuery } from '@oss-scp/platform-db';
import { HealthController } from './health.controller';
import { HealthService, PLATFORM_DB_CONNECTION } from './health.service';
import { LiveRecordQueryController, RecordQueryController } from './record-query.controller';
import { RECORD_QUERY, RecordQueryService } from './record-query.service';
import { PluginController } from './plugin.controller';
import { PluginMenuController } from './plugin-menu.controller';
import { createPluginRuntimeRegistry, PLUGIN_RUNTIME_REGISTRY, type PluginRuntimeRegistry } from './plugin-runtime-registry';
import { CollectionStatusController } from './collection-status.controller';
import { CollectionStatusService } from './collection-status.service';
import type { StartupCollectionManager } from './startup-collection';
import { LIVE_QUERY, LiveQueryManager } from './live-query';
import { AccountManagementDisabledAuthorizer, MANUAL_SYNC_AUTHORIZER, MANUAL_SYNC_EXECUTOR, ManualSyncController, ManualSyncManager, ManualSyncService, manualSyncExecutor, type ManualSyncAuthorizer, type ManualSyncExecutor } from './manual-sync';
import { AUTH_RUNTIME, AuthService, type AuthRuntime } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import type { ScheduledCollectionManager } from './scheduled-collection';

class PlatformDbLifecycle implements OnApplicationShutdown {
  constructor(
    private readonly connection: PlatformDbConnection,
    private readonly live: LiveQueryManager,
    private readonly startup?: StartupCollectionManager,
    private readonly scheduled?: ScheduledCollectionManager,
  ) {}
  async onApplicationShutdown() { await this.scheduled?.close(); await this.startup?.close(); await this.live.close(); await this.connection.close(); }
}

@Module({})
export class AppModule {
  static register(
    connection: PlatformDbConnection,
    query?: RecordQuery,
    registry: PluginRuntimeRegistry = createPluginRuntimeRegistry({ definitions: [], menus: [] }),
    startup?: StartupCollectionManager,
    live: LiveQueryManager = new LiveQueryManager(registry),
    manualSync?: { executor?: ManualSyncExecutor; authorizer?: ManualSyncAuthorizer; configRoot?: string },
    auth: AuthRuntime = { config: { enabled: false } },
    scheduled?: ScheduledCollectionManager,
  ): DynamicModule {
    const unavailable: RecordQuery = {
      listRecords: async () => { throw new Error('record query adapter unavailable'); },
      getRecord: async () => { throw new Error('record query adapter unavailable'); },
    };
    return {
      module: AppModule,
      controllers: [HealthController, RecordQueryController, LiveRecordQueryController, PluginMenuController, PluginController, CollectionStatusController, ManualSyncController, AuthController],
      providers: [
        { provide: PLATFORM_DB_CONNECTION, useValue: connection },
        { provide: RECORD_QUERY, useValue: query ?? unavailable },
        { provide: PLUGIN_RUNTIME_REGISTRY, useValue: registry },
        { provide: LIVE_QUERY, useValue: live },
        HealthService,
        RecordQueryService,
        CollectionStatusService,
        { provide: MANUAL_SYNC_AUTHORIZER, useValue: manualSync?.authorizer ?? new AccountManagementDisabledAuthorizer() },
        { provide: MANUAL_SYNC_EXECUTOR, useValue: manualSync?.executor ?? manualSyncExecutor(manualSync?.configRoot ?? process.env.OSS_SCP_CONFIG_ROOT ?? process.cwd()) },
        ManualSyncManager,
        ManualSyncService,
        { provide: AUTH_RUNTIME, useValue: auth },
        AuthService,
        AuthGuard,
        { provide: APP_GUARD, useExisting: AuthGuard },
        { provide: PlatformDbLifecycle, useFactory: (live: LiveQueryManager) => new PlatformDbLifecycle(connection, live, startup, scheduled), inject: [LIVE_QUERY] },
      ],
      exports: [PLUGIN_RUNTIME_REGISTRY],
    };
  }
}
