import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { Script } from 'node:vm';

export const MAX_TRANSFORM_BYTES = 5 * 1024 * 1024;

export function transformDigest(source: Uint8Array): string {
  return createHash('sha256').update(source).digest('hex');
}

/** 검증한 정확한 CommonJS 바이트를 파일 재조회 없이 실행한다. */
export function loadTransformSnapshot(source: Uint8Array, filename: string): (input: unknown) => unknown {
  if (source.byteLength === 0 || source.byteLength > MAX_TRANSFORM_BYTES) throw new Error('invalid transform source');
  const text = Buffer.from(source).toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(Buffer.from(source))) throw new Error('transform source must be UTF-8');
  const wrapped = `(function (exports, require, module, __filename, __dirname) {\n${text}\n});`;
  const execute = new Script(wrapped, { filename }).runInThisContext() as (
    exports: Record<string, unknown>,
    require: NodeJS.Require,
    module: { exports: Record<string, unknown> },
    filename: string,
    dirname: string,
  ) => void;
  const module = { exports: {} as Record<string, unknown> };
  execute(module.exports, createRequire(filename), module, filename, dirname(filename));
  if (typeof module.exports.transform !== 'function') throw new Error('invalid transform export');
  return module.exports.transform as (input: unknown) => unknown;
}
