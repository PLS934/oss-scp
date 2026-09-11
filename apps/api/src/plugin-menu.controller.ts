import { Controller, Get, Inject } from '@nestjs/common';
import type { ClientMenuItem } from '@oss-scp/plugin-config';

export const PLUGIN_MENUS = Symbol('PLUGIN_MENUS');

@Controller('api/v1/plugin-menus')
export class PluginMenuController {
  constructor(@Inject(PLUGIN_MENUS) private readonly menus: readonly ClientMenuItem[]) {}

  @Get()
  list(): readonly ClientMenuItem[] {
    return this.menus;
  }
}
