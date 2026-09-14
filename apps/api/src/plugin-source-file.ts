import { HttpException, StreamableFile } from '@nestjs/common';
import { constants } from 'node:fs';
import { open, realpath, stat, type FileHandle } from 'node:fs/promises';
import { basename, isAbsolute, relative, sep } from 'node:path';
import type { PluginRuntimeRegistry } from './plugin-runtime-registry';

const unavailable = () => new HttpException({ code: 'SOURCE_FILE_UNAVAILABLE', message: '원본 파일을 내려받을 수 없습니다.' }, 404);

function inside(root: string, file: string): boolean {
  const path = relative(root, file);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export async function downloadLocalCsv(registry: PluginRuntimeRegistry, pluginId: string): Promise<StreamableFile> {
  const plugin = registry.plugins.find(item => item.id === pluginId);
  const definition = registry.getDefinition(pluginId);
  if (!plugin?.enabled || !definition || !('source' in definition) || definition.source.transport !== 'file' || !registry.configRoot) {
    throw unavailable();
  }
  let file: FileHandle | undefined;
  try {
    const root = await realpath(registry.configRoot);
    const resolved = await realpath(definition.source.path);
    if (!inside(root, resolved)) throw unavailable();
    file = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await file.stat();
    const current = await stat(definition.source.path);
    if (!info.isFile() || info.dev !== current.dev || info.ino !== current.ino || await realpath(definition.source.path) !== resolved) {
      throw unavailable();
    }
    const maxBytes = definition.limits.maxBytes ?? 1024 ** 3;
    if (info.size > maxBytes) throw new HttpException({ code: 'SOURCE_FILE_TOO_LARGE', message: '원본 파일이 다운로드 허용 크기를 초과했습니다.' }, 413);
    const name = encodeURIComponent(basename(definition.source.path)).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    // 열린 파일의 길이까지만 전송하므로 전송 중 파일이 커져도 제한을 넘지 않는다.
    const stream = file.createReadStream({ start: 0, end: Math.max(0, info.size - 1), autoClose: true });
    const result = new StreamableFile(stream, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="source.csv"; filename*=UTF-8''${name}`,
      length: info.size,
    });
    result.setErrorHandler((_error, response) => {
      if (response.destroyed) return;
      if (response.headersSent) { response.end(); return; }
      response.statusCode = 503;
      response.send('원본 파일을 내려받을 수 없습니다.');
    });
    file = undefined; // 스트림이 파일 핸들을 소유하고 응답 종료·중단 시 닫는다.
    return result;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw unavailable();
  } finally {
    await file?.close();
  }
}
