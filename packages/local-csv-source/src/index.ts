import { readCsvFile } from '@oss-scp/csv-reader';
import type { LocalCsvCollectionDefinition } from '@oss-scp/plugin-config';

export interface LocalCsvBatch {
  records: Record<string, string>[];
  complete: boolean;
}

export interface LocalCsvExecutionOptions {
  signal?: AbortSignal;
}

export class LocalCsvSourceError extends Error {
  constructor(public readonly code: 'LOCAL_CSV_ABORTED') {
    super(code);
    this.name = 'LocalCsvSourceError';
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new LocalCsvSourceError('LOCAL_CSV_ABORTED');
}

/** 검증된 로컬 CSV definition을 받아 소비 속도에 맞춰 제한된 행 묶음을 전달한다. */
export async function* collectLocalCsv(
  definition: LocalCsvCollectionDefinition,
  options: LocalCsvExecutionOptions = {},
): AsyncGenerator<LocalCsvBatch> {
  const rows = readCsvFile(definition.source.path, definition.limits);
  const iterator = rows[Symbol.asyncIterator]();
  try {
    throwIfAborted(options.signal);
    let next = await iterator.next();
    throwIfAborted(options.signal);

    if (next.done) {
      yield { records: [], complete: true };
      return;
    }

    while (!next.done) {
      const records: Record<string, string>[] = [];
      while (records.length < definition.batching.size && !next.done) {
        records.push(next.value);
        throwIfAborted(options.signal);
        next = await iterator.next();
        throwIfAborted(options.signal);
      }
      yield { records, complete: Boolean(next.done) };
    }
  } finally {
    await iterator.return?.(undefined);
  }
}
