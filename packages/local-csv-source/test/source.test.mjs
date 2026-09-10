import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { validateRepository } from '@oss-scp/plugin-config';
import { collectLocalCsv } from '../dist/index.js';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const temporaryDirectories = [];

function csvDefinition(path, overrides = {}) {
  return {
    plugin: { id: 'test-csv', name: 'Test CSV', version: '0.1.0' },
    source: { transport: 'file', format: 'csv', path },
    batching: { size: 2 },
    limits: {},
    ...overrides,
  };
}

async function temporaryFile(contents) {
  const directory = await mkdtemp(join(tmpdir(), 'local-csv-source-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'input.csv');
  await writeFile(path, contents);
  return path;
}

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('collectLocalCsv', () => {
  test('등록 정의로 샘플 53행을 20행 이하 묶음과 정확한 완료 상태로 전달한다', async () => {
    const result = validateRepository(repositoryRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const definition = result.definitions.find((item) => item.plugin.id === 'vulnerabilities-local-csv');
    expect(definition?.source?.format).toBe('csv');

    const batches = await collect(collectLocalCsv(definition));

    expect(batches.map((batch) => batch.records.length)).toEqual([20, 20, 13]);
    expect(batches.map((batch) => batch.complete)).toEqual([false, false, true]);
    const records = batches.flatMap((batch) => batch.records);
    expect(records).toHaveLength(53);
    expect(records.map((record) => record.cve)).toEqual(
      Array.from({ length: 53 }, (_, index) => `cve-${index + 1}`),
    );
    expect(Object.keys(records[0])).toEqual([
      'cve', 'vul', 'test-data1', 'test-data2', 'test-data3', 'test-data4',
    ]);
    expect(records[0]['test-data2']).toBe('10.0');
    expect(records[0]['test-data4']).toBe('0.10');
  });

  test('다른 헤더와 인용 쉼표·줄바꿈을 문자열 그대로 전달한다', async () => {
    const path = await temporaryFile('id,note\n1,"a,b"\n2,"line 1\nline 2"\n3,0.10\n');

    const batches = await collect(collectLocalCsv(csvDefinition(path)));

    expect(batches).toEqual([
      { records: [{ id: '1', note: 'a,b' }, { id: '2', note: 'line 1\nline 2' }], complete: false },
      { records: [{ id: '3', note: '0.10' }], complete: true },
    ]);
  });

  test('헤더만 있는 파일은 빈 완료 묶음을 반환한다', async () => {
    const path = await temporaryFile('id,value\n');
    await expect(collect(collectLocalCsv(csvDefinition(path)))).resolves.toEqual([
      { records: [], complete: true },
    ]);
  });

  test('파일·파싱·한도 오류 코드를 보존하고 완료로 표시하지 않는다', async () => {
    const missing = join(tmpdir(), `missing-local-csv-${Date.now()}.csv`);
    await expect(collect(collectLocalCsv(csvDefinition(missing)))).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });

    const malformed = await temporaryFile('id,value\n1,"unfinished');
    await expect(collect(collectLocalCsv(csvDefinition(malformed)))).rejects.toMatchObject({ code: 'CSV_FORMAT' });

    const limited = await temporaryFile('id,value\n1,12345\n');
    await expect(collect(collectLocalCsv(csvDefinition(limited, { limits: { maxBytes: 5 } })))).rejects.toMatchObject({ code: 'CSV_LIMIT' });
  });

  test('후속 파싱 실패 전에 전달한 묶음은 불완전 상태다', async () => {
    const path = await temporaryFile('id,value\n1,a\n2,b\n3,c\n4,"unfinished');
    const iterator = collectLocalCsv(csvDefinition(path))[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { records: [{ id: '1', value: 'a' }, { id: '2', value: 'b' }], complete: false },
    });
    await expect(iterator.next()).rejects.toMatchObject({ code: 'CSV_FORMAT' });
  });

  test('파일 변경을 감지하며 이전 묶음을 완료로 바꾸지 않는다', async () => {
    const path = await temporaryFile('id\n1\n2\n3\n');
    const iterator = collectLocalCsv(csvDefinition(path))[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value.complete).toBe(false);
    await appendFile(path, '4\n');
    await expect(iterator.next()).rejects.toMatchObject({ code: 'FILE_CHANGED' });
  });

  test('시작 전과 묶음 사이의 취소를 구분하고 iterator를 종료한다', async () => {
    const path = await temporaryFile('id\n1\n2\n3\n');
    const before = new AbortController();
    before.abort();
    await expect(collect(collectLocalCsv(csvDefinition(path), { signal: before.signal })))
      .rejects.toMatchObject({ code: 'LOCAL_CSV_ABORTED' });

    const during = new AbortController();
    const iterator = collectLocalCsv(csvDefinition(path), { signal: during.signal })[Symbol.asyncIterator]();
    expect((await iterator.next()).value.complete).toBe(false);
    during.abort();
    await expect(iterator.next()).rejects.toMatchObject({ code: 'LOCAL_CSV_ABORTED' });

    await expect(rm(path)).resolves.toBeUndefined();
  });

  test('소비자가 조기 종료해도 다음 실행은 처음부터 정상 완료한다', async () => {
    const path = await temporaryFile(`id,value\n${Array.from({ length: 10_000 }, (_, index) => `${index},${'x'.repeat(100)}`).join('\n')}\n`);
    for await (const batch of collectLocalCsv(csvDefinition(path, { batching: { size: 10 } }))) {
      expect(batch.records).toHaveLength(10);
      expect(batch.complete).toBe(false);
      break;
    }
    const rerun = await collect(collectLocalCsv(csvDefinition(path, { batching: { size: 10_000 } })));
    expect(rerun).toHaveLength(1);
    expect(rerun[0].records).toHaveLength(10_000);
    expect(rerun[0].complete).toBe(true);
  });
});
