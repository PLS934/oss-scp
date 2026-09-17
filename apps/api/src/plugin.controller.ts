import { Controller, Get, Header, HttpException, Inject, Param } from '@nestjs/common';
import { downloadLocalCsv } from './plugin-source-file';
import type { ClientPluginSummary } from '@oss-scp/plugin-config';
import { PLUGIN_RUNTIME_REGISTRY, type PluginRuntimeRegistry } from './plugin-runtime-registry';
import { readPluginTransform } from './plugin-transform-code';

@Controller('api/v1/plugins')
export class PluginController {
  constructor(@Inject(PLUGIN_RUNTIME_REGISTRY) private readonly registry: PluginRuntimeRegistry) {}

  @Get(':id/source-file')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  download(@Param('id') id: string) {
    return downloadLocalCsv(this.registry, id);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async detail(@Param('id') id: string) {
    const detail = this.registry.getPluginDetail(id);
    if (!detail) throw new HttpException({ code: 'PLUGIN_NOT_FOUND', message: '플러그인을 찾을 수 없습니다.' }, 404);
    return { ...detail.configuration, transform: await readPluginTransform(detail.transformFiles) };
  }

  @Get()
  list(): readonly ClientPluginSummary[] {
    return this.registry.plugins.map(plugin => ({
      id: plugin.id,
      name: plugin.name,
      ...(plugin.description === undefined ? {} : { description: plugin.description }),
      enabled: plugin.enabled,
      sourceType: plugin.sourceType,
      ...(plugin.endpoint ? { endpoint: { url: plugin.endpoint.url, method: plugin.endpoint.method } } : {}),
      ...(plugin.fileName === undefined ? {} : { fileName: plugin.fileName }),
    }));
  }
}
