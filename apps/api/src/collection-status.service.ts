import { Inject, Injectable } from '@nestjs/common';
import type { RecordQuery } from '@oss-scp/platform-db';
import { definitionRevision, PLUGIN_RUNTIME_REGISTRY, type PluginRuntimeRegistry } from './plugin-runtime-registry';
import { RECORD_QUERY } from './record-query.service';

@Injectable()
export class CollectionStatusService {
  constructor(
    @Inject(RECORD_QUERY) private readonly query: RecordQuery,
    @Inject(PLUGIN_RUNTIME_REGISTRY) private readonly registry: PluginRuntimeRegistry,
  ) {}

  async list() {
    return Promise.all(this.registry.menus.filter(menu => menu.sourceMode !== 'live').map(async menu => {
      const result = await this.query.listRecords({
        pluginId: menu.pluginId, sourceId: menu.sourceId, dataType: menu.dataType, limit: 20,
      });
      const definition = this.registry.getDefinition(menu.pluginId);
      return {
        pluginId: menu.pluginId,
        sourceId: menu.sourceId,
        dataType: menu.dataType,
        configRevision: definition ? definitionRevision(definition) : null,
        status: !result.collection || result.collection.status === 'never_collected' ? 'uncollected' : result.collection.status,
        runId: result.collection?.runId ?? null,
        startedAt: result.collection?.startedAt ?? null,
        finishedAt: result.collection?.finishedAt ?? null,
      };
    }));
  }
}
