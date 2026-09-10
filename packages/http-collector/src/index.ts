import type { OffsetCollectionDefinition } from '@oss-scp/plugin-config';

export type HttpCollectorErrorCode =
  | 'http_status'
  | 'timeout'
  | 'cancelled'
  | 'response_too_large'
  | 'record_too_large'
  | 'invalid_json'
  | 'invalid_response'
  | 'total_changed'
  | 'count_mismatch'
  | 'processing';

export class HttpCollectorError extends Error {
  constructor(
    public readonly code: HttpCollectorErrorCode,
    message: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'HttpCollectorError';
    this.status = options?.status;
  }

  readonly status?: number;
}

export interface CollectionBatch {
  items: unknown[];
  offset: number;
  total: number;
  signal: AbortSignal;
}

export interface CollectionSummary {
  pages: number;
  records: number;
  total: number;
}

export type BatchHandler = (batch: CollectionBatch) => void | Promise<void>;

function location(url: URL, offset: number): string {
  return `${url.origin}${url.pathname} at offset ${offset}`;
}

function collectorError(
  code: HttpCollectorErrorCode,
  url: URL,
  offset: number,
  cause?: unknown,
): HttpCollectorError {
  const labels: Record<HttpCollectorErrorCode, string> = {
    http_status: 'HTTP request failed',
    timeout: 'HTTP request timed out',
    cancelled: 'Collection was cancelled',
    response_too_large: 'HTTP response exceeded its byte limit',
    record_too_large: 'A response record exceeded its byte limit',
    invalid_json: 'HTTP response was not valid JSON',
    invalid_response: 'HTTP response structure was invalid',
    total_changed: 'HTTP response total changed during collection',
    count_mismatch: 'HTTP response item count did not match total',
    processing: 'Batch processing failed',
  };
  return new HttpCollectorError(code, `${labels[code]}: ${location(url, offset)}`, {
    cause,
  });
}

function valueAtPath(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split('.')) {
    if (
      current === null ||
      typeof current !== 'object' ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

async function readLimitedBody(
  response: Response,
  maximum: number,
  url: URL,
  offset: number,
): Promise<Uint8Array> {
  if (!response.body) {
    throw collectorError('invalid_response', url, offset);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) {
        await reader.cancel();
        throw collectorError('response_too_large', url, offset);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let position = 0;
  for (const chunk of chunks) {
    body.set(chunk, position);
    position += chunk.byteLength;
  }
  return body;
}

async function fetchPage(
  definition: OffsetCollectionDefinition,
  requestUrl: URL,
  offset: number,
  callerSignal?: AbortSignal,
): Promise<unknown> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), definition.limits.timeoutMs);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal;
  try {
    const response = await fetch(requestUrl, {
      method: definition.request.method,
      signal,
      redirect: 'error',
    });
    if (!response.ok) {
      throw new HttpCollectorError(
        'http_status',
        `HTTP ${response.status} from ${location(requestUrl, offset)}`,
        { status: response.status },
      );
    }
    const body = await readLimitedBody(
      response,
      definition.limits.maxResponseBytes,
      requestUrl,
      offset,
    );
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
    } catch (error) {
      throw collectorError('invalid_json', requestUrl, offset, error);
    }
  } catch (error) {
    if (error instanceof HttpCollectorError) throw error;
    if (callerSignal?.aborted) throw collectorError('cancelled', requestUrl, offset, error);
    if (timeoutController.signal.aborted) {
      throw collectorError('timeout', requestUrl, offset, error);
    }
    throw collectorError('invalid_response', requestUrl, offset, error);
  } finally {
    clearTimeout(timer);
  }
}

export async function collectHttpOffset(
  definition: OffsetCollectionDefinition,
  onBatch: BatchHandler,
  options: { signal?: AbortSignal } = {},
): Promise<CollectionSummary> {
  const baseUrl = new URL(definition.request.path, definition.connection.baseUrl);
  let offset = definition.pagination.start;
  let initialTotal: number | undefined;
  let pages = 0;
  let records = 0;

  while (true) {
    if (options.signal?.aborted) {
      throw collectorError('cancelled', baseUrl, offset, options.signal.reason);
    }
    const requestUrl = new URL(baseUrl);
    requestUrl.searchParams.set(definition.pagination.offsetParam, String(offset));
    requestUrl.searchParams.set(
      definition.pagination.limitParam,
      String(definition.pagination.limit),
    );
    const payload = await fetchPage(definition, requestUrl, offset, options.signal);
    const items = valueAtPath(payload, definition.response.itemsPath);
    const total = valueAtPath(payload, definition.response.totalPath);
    if (!Array.isArray(items) || !Number.isSafeInteger(total) || (total as number) < 0) {
      throw collectorError('invalid_response', requestUrl, offset);
    }
    if (initialTotal === undefined) initialTotal = total as number;
    else if (total !== initialTotal) {
      throw collectorError('total_changed', requestUrl, offset);
    }
    if (offset > initialTotal) {
      throw collectorError('count_mismatch', requestUrl, offset);
    }
    const expected = Math.min(definition.pagination.limit, initialTotal - offset);
    if (items.length !== expected) {
      throw collectorError('count_mismatch', requestUrl, offset);
    }
    for (const item of items) {
      let serialized: string | undefined;
      try {
        serialized = JSON.stringify(item);
      } catch (error) {
        throw collectorError('invalid_response', requestUrl, offset, error);
      }
      if (serialized === undefined) {
        throw collectorError('invalid_response', requestUrl, offset);
      }
      if (Buffer.byteLength(serialized, 'utf8') > definition.limits.maxRecordBytes) {
        throw collectorError('record_too_large', requestUrl, offset);
      }
    }
    if (offset === initialTotal) {
      return { pages, records, total: initialTotal };
    }
    try {
      await onBatch({ items, offset, total: initialTotal, signal: options.signal ?? new AbortController().signal });
    } catch (error) {
      if (options.signal?.aborted) {
        throw collectorError('cancelled', requestUrl, offset, error);
      }
      throw collectorError('processing', requestUrl, offset, error);
    }
    if (options.signal?.aborted) {
      throw collectorError('cancelled', requestUrl, offset, options.signal.reason);
    }
    pages += 1;
    records += items.length;
    offset += items.length;
    if (offset === initialTotal) return { pages, records, total: initialTotal };
  }
}

export type { OffsetCollectionDefinition } from '@oss-scp/plugin-config';
