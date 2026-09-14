import { Controller, Get, Inject } from '@nestjs/common';
import type { ClientPluginSummary } from '@oss-scp/plugin-config';
import { PLUGIN_RUNTIME_REGISTRY, type PluginRuntimeRegistry } from './plugin-runtime-registry';

@Controller('api/v1/plugins')
export class PluginController {
  constructor(@Inject(PLUGIN_RUNTIME_REGISTRY) private readonly registry: PluginRuntimeRegistry) {}

  @Get()
  list(): readonly ClientPluginSummary[] {
    return this.registry.plugins.map(plugin => ({
      id: plugin.id,
      name: plugin.name,
      ...(plugin.description === undefined ? {} : { description: plugin.description }),
      enabled: plugin.enabled,
      sourceType: plugin.sourceType,
    }));
  }
}
