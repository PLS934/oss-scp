import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { mkdtemp, writeFile, rm, chmod, appendFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, readCsvFile } from '../dist/index.js';

const collect = async iterable => { const rows = []; for await (const row of iterable) rows.push(row); return rows; };
const csv = (text, options) => collect(parseCsv(Readable.from([Buffer.from(text)]), options));
const sample = fileURLToPath(new URL('../../../fixtures/csv/vulnerabilities.csv', import.meta.url));
async function temporary(run) {
  const dir = await mkdtemp(join(tmpdir(), 'csv-reader-'));
  try { await run(join(dir, 'input.csv'), dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

describe('CSV 문자열 계약', () => {
  it('샘플 53행을 순서·6필드·문자열을 보존해 읽는다', async () => {
    const rows = await collect(readCsvFile(sample));
    expect(rows).toHaveLength(53);
    expect(rows.map(row => row.cve)).toEqual(Array.from({ length: 53 }, (_, i) => `cve-${i + 1}`));
    for (const row of rows) {
      expect(Object.keys(row)).toEqual(['cve', 'vul', 'test-data1', 'test-data2', 'test-data3', 'test-data4']);
      expect(Object.values(row).every(value => typeof value === 'string')).toBe(true);
    }
    expect(rows[0]['test-data2']).toBe('10.0');
    expect(rows[0]['test-data4']).toBe('0.10');
  });
  it.each(['\n', '\r\n', '\r'])('BOM·인용·한글을 1바이트 경계로 처리한다: %j', async newline => {
    const text = `\ufeffname,value${newline}"가,나","a${newline}b"${newline}"a""b", 0.10 ${newline}`;
    const chunks = Array.from(Buffer.from(text), byte => Buffer.from([byte]));
    expect(await collect(parseCsv(Readable.from(chunks)))).toEqual([
      { name: '가,나', value: `a${newline}b` }, { name: 'a"b', value: ' 0.10 ' },
    ]);
  });
  it('빈 줄·헤더만 있는 입력·빈 필드·특수 헤더를 처리한다', async () => {
    expect(await csv('\nkey,value\n\n')).toEqual([]);
    const [row] = await csv('__proto__,constructor\nx,\n');
    expect(Object.keys(row)).toEqual(['__proto__', 'constructor']);
    expect(row.__proto__).toBe('x');
    expect(row.constructor).toBe('');
  });
  it.each(['', '\n', 'a,a\n1,2', ',b\n1,2', 'a, \n1,2', 'a,b\n1', 'a,b\n1,2,3', 'a\n"bad', 'a\nb"ad'])('잘못된 CSV를 거부한다: %j', async text => {
    await expect(csv(text)).rejects.toMatchObject({ code: 'CSV_FORMAT' });
  });
  it('잘못된 UTF-8과 끝의 불완전한 멀티바이트를 거부한다', async () => {
    for (const bytes of [[0xff], [0xe3, 0x81]]) {
      await expect(collect(parseCsv(Readable.from([Buffer.from('a\n'), Buffer.from(bytes)]))))
        .rejects.toMatchObject({ code: 'CSV_FORMAT' });
    }
  });
  it('입력·레코드 한도와 잘못된 옵션을 검증한다', async () => {
    await expect(csv('a\n12345', { maxBytes: 6 })).rejects.toMatchObject({ code: 'CSV_LIMIT' });
    await expect(csv('a\n12345', { maxRecordSize: 3 })).rejects.toMatchObject({ code: 'CSV_LIMIT' });
    expect(await csv('a\n12345', { maxBytes: 7 })).toEqual([{ a: '12345' }]);
    for (const value of [0, -1, NaN, Infinity, 1.5]) {
      await expect(csv('a\n1', { maxBytes: value })).rejects.toMatchObject({ code: 'CSV_OPTIONS' });
    }
  });
});

describe('파일·스트림 수명', () => {
  it('파일 없음과 일반 파일이 아닌 경로를 구분한다', () => temporary(async (path, dir) => {
    await expect(collect(readCsvFile(path))).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
    await expect(collect(readCsvFile(dir))).rejects.toMatchObject({ code: 'FILE_ACCESS' });
  }));
  it.skipIf(process.getuid?.() === 0)('접근 권한 실패', () => temporary(async path => {
    await writeFile(path, 'a\n1');
    await chmod(path, 0);
    try { await expect(collect(readCsvFile(path))).rejects.toMatchObject({ code: 'FILE_ACCESS' }); }
    finally { await chmod(path, 0o600); }
  }));
  it('파일 크기 사전 제한', () => temporary(async path => {
    await writeFile(path, 'a\n12345');
    await expect(collect(readCsvFile(path, { maxBytes: 3 }))).rejects.toMatchObject({ code: 'CSV_LIMIT' });
  }));
  it.each(['append', 'replace'])('순회 중 파일 변경: %s', mode => temporary(async path => {
    await writeFile(path, 'a\n1\n2\n');
    const iterator = readCsvFile(path);
    expect((await iterator.next()).value).toEqual({ a: '1' });
    if (mode === 'append') await appendFile(path, '3\n');
    else { await writeFile(`${path}.new`, 'a\n1\n2\n'); await rename(`${path}.new`, path); }
    await expect(collect(iterator)).rejects.toMatchObject({ code: 'FILE_CHANGED' });
  }));
  it('대량 입력을 미리 모두 읽지 않고 중단 시 자원을 해제한다', async () => {
    let produced = 0;
    let closed = false;
    const input = Readable.from((async function* () {
      try { yield Buffer.from('id,value\n'); for (let i = 0; i < 100000; i++) { produced++; yield Buffer.from(`${i},${'x'.repeat(100)}\n`); } }
      finally { closed = true; }
    })());
    for await (const row of parseCsv(input)) { expect(row.id).toBe('0'); break; }
    expect(produced).toBeLessThan(2000);
    expect(closed).toBe(true);
    expect(input.destroyed).toBe(true);
  });
  it('대량·혼합 행 10000건의 순서와 누락을 검사한다', async () => {
    const input = Readable.from((async function* () {
      yield Buffer.from('id,value\n');
      for (let i = 0; i < 10000; i++) yield Buffer.from(`${i},"${i % 100 === 0 ? '큰값'.repeat(1000) : 'a,b'}"\n`);
    })());
    let count = 0;
    for await (const row of parseCsv(input)) { expect(row.id).toBe(String(count++)); }
    expect(count).toBe(10000);
  });
  it('읽기 중단 오류를 정상 완료로 처리하지 않는다', async () => {
    const input = Readable.from((async function* () { yield Buffer.from('a\n1\n'); throw new Error('private data'); })());
    await expect(collect(parseCsv(input))).rejects.toMatchObject({ code: 'FILE_ACCESS', message: 'FILE_ACCESS' });
    expect(input.destroyed).toBe(true);
  });
  it('조기 중단 후 다시 읽으면 처음부터 53행을 반환한다', async () => {
    for await (const row of readCsvFile(sample)) { expect(row.cve).toBe('cve-1'); break; }
    expect(await collect(readCsvFile(sample))).toHaveLength(53);
  });
});
