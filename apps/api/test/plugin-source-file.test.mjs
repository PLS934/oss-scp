import 'reflect-metadata';
import { mkdtemp, writeFile, readFile, rm, symlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, test } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../dist/app.module.js';
import { createPluginRuntimeRegistry } from '../dist/plugin-runtime-registry.js';

const cleanup = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture(maxBytes = 4096) {
  const root = await mkdtemp(join(tmpdir(), 'oss-scp-source-file-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const file = join(root, '원본.csv');
  await writeFile(file, '\ufeffid,name\r\n1,원본\r\n');
  const registry = createPluginRuntimeRegistry({
    configRoot: root,
    plugins: [{ id: 'local', name: 'CSV', enabled: true, sourceType: 'local-csv', fileName: '원본.csv' }, { id: 'disabled', enabled: false }],
    definitions: [{ plugin: { id: 'local' }, source: { transport: 'file', format: 'csv', path: file }, limits: { maxBytes } }],
    menus: [],
  });
  const connection = { checkReady: async () => true, close: async () => undefined };
  const module = await Test.createTestingModule({ imports: [AppModule.register(connection, undefined, registry)] }).compile();
  const app = module.createNestApplication();
  await app.listen(0, '127.0.0.1');
  cleanup.push(() => app.close());
  return { root, file, url: `${await app.getUrl()}/api/v1/plugins` };
}

test('로컬 CSV를 변환 없이 attachment로 제공한다', async () => {
  const { file, url } = await fixture();
  const expected = await readFile(file);
  const response = await fetch(`${url}/local/source-file`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/csv');
  expect(response.headers.get('content-disposition')).toContain(`filename*=UTF-8''${encodeURIComponent('원본.csv')}`);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(Buffer.from(await response.arrayBuffer())).toEqual(expected);
});

test('빈 CSV 파일도 빈 원본으로 제공한다', async () => {
  const { file, url } = await fixture();
  await writeFile(file, '');
  const response = await fetch(`${url}/local/source-file`);
  expect(response.status).toBe(200);
  expect((await response.arrayBuffer()).byteLength).toBe(0);
});

test('미등록·비활성 대상과 임의 경로를 거부한다', async () => {
  const { url, root } = await fixture();
  for (const id of ['missing', 'disabled', encodeURIComponent('../secret')]) {
    const response = await fetch(`${url}/${id}/source-file`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(root);
  }
});

test('파일 누락 및 디렉터리는 내부 경로 없이 실패한다', async () => {
  const { url, file, root } = await fixture();
  await rm(file);
  expect((await fetch(`${url}/local/source-file`)).status).toBe(404);
  await mkdir(file);
  const response = await fetch(`${url}/local/source-file`);
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain(root);
});

test('기동 후 외부 파일로 교체된 심볼릭 링크를 거부한다', async () => {
  const { url, file, root } = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'oss-scp-outside-'));
  cleanup.push(() => rm(outside, { recursive: true, force: true }));
  const secret = join(outside, 'private.csv');
  await writeFile(secret, 'do-not-expose');
  await rm(file);
  await symlink(secret, file);
  const response = await fetch(`${url}/local/source-file`);
  expect(response.status).toBe(404);
  expect(await response.text()).not.toMatch(new RegExp(`${root}|do-not-expose|private.csv`));
});

test('source의 파일 크기 제한을 적용한다', async () => {
  const { url } = await fixture(1);
  const response = await fetch(`${url}/local/source-file`);
  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({ code: 'SOURCE_FILE_TOO_LARGE' });
});
