import { constants } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parse, CsvError } from 'csv-parse';

export type CsvErrorCode = 'FILE_NOT_FOUND' | 'FILE_ACCESS' | 'FILE_CHANGED' | 'CSV_FORMAT' | 'CSV_LIMIT' | 'CSV_OPTIONS';
export class CsvReadError extends Error {
  constructor(public readonly code: CsvErrorCode) {
    super(code);
    this.name = 'CsvReadError';
  }
}
export interface CsvOptions {
  maxBytes?: number;
  maxRecordSize?: number;
}
function limits(options: CsvOptions) {
  const maxBytes = options.maxBytes ?? 1024 ** 3;
  const maxRecordSize = options.maxRecordSize ?? 1024 ** 2;
  if (![maxBytes, maxRecordSize].every(n => Number.isSafeInteger(n) && n > 0)) {
    throw new CsvReadError('CSV_OPTIONS');
  }
  return { maxBytes, maxRecordSize };
}
function normalize(error: unknown): CsvReadError {
  if (error instanceof CsvReadError) return error;
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'CSV_MAX_RECORD_SIZE') return new CsvReadError('CSV_LIMIT');
  if (error instanceof CsvError || code?.startsWith('CSV_') || code === 'ERR_ENCODING_INVALID_ENCODED_DATA') return new CsvReadError('CSV_FORMAT');
  return new CsvReadError(code === 'ENOENT' ? 'FILE_NOT_FOUND' : 'FILE_ACCESS');
}

/** 바이트 스트림의 소유권을 받아 종료·실패·조기 반환 시 닫는다. */
export async function* parseCsv(input: Readable, options: CsvOptions = {}): AsyncGenerator<Record<string, string>> {
  let done: Promise<void> | undefined;
  let parser: ReturnType<typeof parse> | undefined;
  let failure: unknown;
  try {
    const { maxBytes, maxRecordSize } = limits(options);
    let bytes = 0;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const validate = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        try {
          bytes += chunk.length;
          if (bytes > maxBytes) throw new CsvReadError('CSV_LIMIT');
          decoder.decode(chunk, { stream: true });
          callback(null, chunk);
        } catch (error) { callback(normalize(error)); }
      },
      flush(callback) {
        try { decoder.decode(); callback(); } catch (error) { callback(normalize(error)); }
      },
    });
    parser = parse({ bom: true, skip_empty_lines: true, max_record_size: maxRecordSize });
    done = pipeline(input, validate, parser).catch(error => { failure = error; });
    let headers: string[] | undefined;
    for await (const values of parser as AsyncIterable<string[]>) {
      if (!headers) {
        if (values.some(value => value.trim() === '') || new Set(values).size !== values.length) {
          throw new CsvReadError('CSV_FORMAT');
        }
        headers = values;
      } else {
        yield Object.fromEntries(headers.map((header, index) => [header, values[index]]));
      }
    }
    await done;
    if (failure) throw failure;
    if (!headers) throw new CsvReadError('CSV_FORMAT');
  } catch (error) {
    throw normalize(error);
  } finally {
    input.destroy();
    parser?.destroy();
    await done;
  }
}

export async function* readCsvFile(path: string, options: CsvOptions = {}): AsyncGenerator<Record<string, string>> {
  const { maxBytes } = limits(options);
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    // 비일반 파일(FIFO 등)을 열 때 대기하지 않고 stat으로 거부한다.
    file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const before = await file.stat({ bigint: true });
    if (!before.isFile()) throw new CsvReadError('FILE_ACCESS');
    if (before.size > BigInt(maxBytes)) throw new CsvReadError('CSV_LIMIT');
    const handle = file;
    let bytesRead = 0;
    const input = Readable.from((async function* () {
      const buffer = Buffer.alloc(16 * 1024);
      while (true) {
        const result = await handle.read(buffer, 0, buffer.length, bytesRead);
        if (result.bytesRead === 0) return;
        bytesRead += result.bytesRead;
        // 다음 read가 파서에 전달된 버퍼를 덮어쓰지 않게 복사한다.
        yield Buffer.from(buffer.subarray(0, result.bytesRead));
      }
    })(), { highWaterMark: 1 });
    yield* parseCsv(input, options);
    const after = await file.stat({ bigint: true });
    const current = await stat(path, { bigint: true }).catch(() => { throw new CsvReadError('FILE_CHANGED'); });
    const unchanged = [after, current].every(value =>
      value.dev === before.dev && value.ino === before.ino && value.size === before.size &&
      value.mtimeNs === before.mtimeNs && value.ctimeNs === before.ctimeNs);
    if (!unchanged || BigInt(bytesRead) !== before.size) throw new CsvReadError('FILE_CHANGED');
  } catch (error) {
    throw normalize(error);
  } finally {
    await file?.close();
  }
}
