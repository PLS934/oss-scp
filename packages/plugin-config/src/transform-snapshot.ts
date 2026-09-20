import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { Script } from 'node:vm';
import { parse } from 'acorn';

export const MAX_TRANSFORM_BYTES = 5 * 1024 * 1024;

export function transformDigest(source: Uint8Array): string {
  return createHash('sha256').update(source).digest('hex');
}

function sourceText(source: Uint8Array): string {
  if (source.byteLength === 0 || source.byteLength > MAX_TRANSFORM_BYTES) throw new Error('invalid transform source');
  const text = Buffer.from(source).toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(Buffer.from(source))) throw new Error('transform source must be UTF-8');
  return text;
}

function containsModuleAccess(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  const node = value as { type?: unknown; name?: unknown; object?: unknown; property?: unknown; computed?: unknown };
  if (node.type === 'ImportDeclaration' || node.type === 'ImportExpression' || node.type === 'ExportAllDeclaration') return true;
  if (node.type === 'ExportNamedDeclaration' && 'source' in node && node.source !== null) return true;
  if (node.type === 'Identifier' && node.name === 'require') return true;
  if (node.type === 'MemberExpression'
    && (node.object as { type?: unknown; name?: unknown })?.type === 'Identifier'
    && (node.object as { name?: unknown }).name === 'process'
    && ((node.computed === false
      && (node.property as { type?: unknown; name?: unknown })?.type === 'Identifier'
      && (node.property as { name?: unknown }).name === 'getBuiltinModule')
      || (node.computed === true
        && (node.property as { type?: unknown; value?: unknown })?.type === 'Literal'
        && (node.property as { value?: unknown }).value === 'getBuiltinModule'))) return true;
  return Object.values(value).some(nested => containsModuleAccess(nested, seen));
}

/** scheduled transform이 외부 파일을 다시 읽을 수 있는 정적 module access를 실행 전에 거부한다. */
export function assertSelfContainedTransform(source: Uint8Array): void {
  const program = parse(sourceText(source), { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true });
  if (containsModuleAccess(program)) throw new Error('scheduled transform must be self-contained');
}

/** 검증한 정확한 CommonJS 바이트를 파일 재조회 없이 실행한다. */
export function loadTransformSnapshot(source: Uint8Array, filename: string): (input: unknown) => unknown {
  return loadTransformSnapshotWithRequire(source, filename, createRequire(filename));
}

export function loadSelfContainedTransformSnapshot(source: Uint8Array, filename: string): (input: unknown) => unknown {
  assertSelfContainedTransform(source);
  const denied = (() => { throw new Error('scheduled transform module access is disabled'); }) as unknown as NodeJS.Require;
  return loadTransformSnapshotWithRequire(source, filename, denied);
}

function loadTransformSnapshotWithRequire(source: Uint8Array, filename: string, requireModule: NodeJS.Require): (input: unknown) => unknown {
  const wrapped = `(function (exports, require, module, __filename, __dirname) {\n${sourceText(source)}\n});`;
  const execute = new Script(wrapped, { filename }).runInThisContext() as (
    exports: Record<string, unknown>, require: NodeJS.Require, module: { exports: Record<string, unknown> }, filename: string, dirname: string,
  ) => void;
  const module = { exports: {} as Record<string, unknown> };
  execute(module.exports, requireModule, module, filename, dirname(filename));
  if (typeof module.exports.transform !== 'function') throw new Error('invalid transform export');
  return module.exports.transform as (input: unknown) => unknown;
}
