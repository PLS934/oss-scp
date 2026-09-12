import { Controller, Get, Inject } from '@nestjs/common';
import type { ClientMenuItem } from '@oss-scp/plugin-config';
import { PLUGIN_RUNTIME_REGISTRY, type PluginRuntimeRegistry } from './plugin-runtime-registry';

@Controller('api/v1/plugin-menus')
export class PluginMenuController {
  constructor(@Inject(PLUGIN_RUNTIME_REGISTRY) private readonly registry: PluginRuntimeRegistry) {}

  @Get()
  list(): readonly ClientMenuItem[] {
    return this.registry.menus;
  }
}
