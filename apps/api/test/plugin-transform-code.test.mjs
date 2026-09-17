import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { readPluginTransform } from '../dist/plugin-transform-code.js';

const roots = [];
const fixture = () => {
  const pluginRoot = mkdtempSync(join(tmpdir(), 'oss-scp-transform-'));
  roots.push(pluginRoot);
  mkdirSync(join(pluginRoot, 'dist'));
  const runtimePath = join(pluginRoot, 'dist/transform.js');
  const sourcePath = join(pluginRoot, 'transform.ts');
  writeFileSync(runtimePath, 'exports.transform = () => ({ records: [] });\n');
  return { pluginRoot, runtimePath, sourcePath };
};

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test('TypeScript 원본을 우선하고 없으면 배포 JavaScript를 읽는다', async () => {
  const files = fixture();
  writeFileSync(files.sourcePath, 'export const transform = () => ({ records: [] });\n');
  await expect(readPluginTransform(files)).resolves.toMatchObject({ status: 'available', kind: 'typescript-source', code: expect.stringContaining('export const') });
  rmSync(files.sourcePath);
  await expect(readPluginTransform(files)).resolves.toMatchObject({ status: 'available', kind: 'javascript-runtime', code: expect.stringContaining('exports.transform') });
});

test('루트 이탈·심볼릭 링크·누락·크기 초과를 공개 오류로 처리한다', async () => {
  const files = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'oss-scp-transform-outside-'));
  roots.push(outside);
  const secret = join(outside, 'secret.ts');
  writeFileSync(secret, 'DO_NOT_EXPOSE');
  symlinkSync(secret, files.sourcePath);
  rmSync(files.runtimePath);
  let result = await readPluginTransform(files);
  expect(result).toEqual({ status: 'unavailable', reason: '가공 코드 파일을 읽을 수 없습니다.' });
  expect(JSON.stringify(result)).not.toMatch(/DO_NOT_EXPOSE|secret\.ts|oss-scp-transform/);
  rmSync(files.sourcePath);
  writeFileSync(files.runtimePath, 'x'.repeat(512 * 1024 + 1));
  result = await readPluginTransform(files);
  expect(result.status).toBe('unavailable');
});
