import { constants } from 'node:fs';
import { lstat, open, realpath, stat, type FileHandle } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import type { ClientTransformDetail, PluginTransformFiles } from '@oss-scp/plugin-config';

const MAX_TRANSFORM_BYTES = 512 * 1024;
const unavailable = (reason = '가공 코드 파일을 읽을 수 없습니다.'): ClientTransformDetail => ({ status: 'unavailable', reason });

function inside(root: string, file: string): boolean {
  const path = relative(root, file);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function readCandidate(root: string, path: string): Promise<string | undefined> {
  let file: FileHandle | undefined;
  try {
    if ((await lstat(path)).isSymbolicLink()) return undefined;
    const resolved = await realpath(path);
    if (!inside(root, resolved)) return undefined;
    file = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = await file.stat();
    const current = await stat(path);
    if (!opened.isFile() || opened.size > MAX_TRANSFORM_BYTES || opened.dev !== current.dev || opened.ino !== current.ino || await realpath(path) !== resolved) return undefined;
    return await file.readFile({ encoding: 'utf8' });
  } catch {
    return undefined;
  } finally {
    await file?.close();
  }
}

export async function readPluginTransform(files: PluginTransformFiles): Promise<ClientTransformDetail> {
  let root: string;
  try { root = await realpath(files.pluginRoot); }
  catch { return unavailable(); }
  if (files.sourcePath) {
    const code = await readCandidate(root, files.sourcePath);
    if (code !== undefined) return { status: 'available', kind: 'typescript-source', code };
  }
  const code = await readCandidate(root, files.runtimePath);
  return code === undefined ? unavailable() : { status: 'available', kind: 'javascript-runtime', code };
}
