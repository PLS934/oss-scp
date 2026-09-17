import type {
  HttpCollectionLimits,
  OffsetCollectionDefinition,
  SingleCollectionDefinition,
} from '@oss-scp/plugin-config';
import { HttpAuthenticationError, resolveHttpAuthenticationHeaders } from '@oss-scp/plugin-config';

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
  | 'processing'
  | 'authentication';

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

export interface SingleCollectionBatch {
  items: unknown[];
  responseMetadata?: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
}

export interface SingleCollectionSummary {
  requests: 1;
  records: number;
}

export type SingleBatchHandler = (
  batch: SingleCollectionBatch,
) => void | Promise<void>;

function location(url: URL, offset?: number): string {
  const requestLocation = `${url.origin}${url.pathname}`;
  return offset === undefined ? requestLocation : `${requestLocation} at offset ${offset}`;
}

function collectorError(
  code: HttpCollectorErrorCode,
  url: URL,
  offset?: number,
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
    authentication: 'HTTP authentication configuration is invalid',
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
  offset?: number,
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

async function fetchJson(
  limits: HttpCollectionLimits,
  method: 'GET',
  requestUrl: URL,
  headers: Readonly<Record<string, string>>,
  callerSignal?: AbortSignal,
  offset?: number,
): Promise<unknown> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), limits.timeoutMs);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal;
  try {
    const response = await fetch(requestUrl, {
      method,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
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
      limits.maxResponseBytes,
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

function authenticationHeaders(
  definition: OffsetCollectionDefinition | SingleCollectionDefinition,
  url: URL,
): Readonly<Record<string, string>> {
  try {
    return resolveHttpAuthenticationHeaders(definition.connection.auth);
  } catch (error) {
    if (error instanceof HttpAuthenticationError) {
      throw new HttpCollectorError('authentication', error.message);
    }
    throw collectorError('authentication', url);
  }
}

function validateRecords(
  items: unknown[],
  maximum: number,
  url: URL,
  offset?: number,
): void {
  for (const item of items) {
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(item);
    } catch (error) {
      throw collectorError('invalid_response', url, offset, error);
    }
    if (serialized === undefined) {
      throw collectorError('invalid_response', url, offset);
    }
    if (Buffer.byteLength(serialized, 'utf8') > maximum) {
      throw collectorError('record_too_large', url, offset);
    }
  }
}

export async function collectHttpOffset(
  definition: OffsetCollectionDefinition,
  onBatch: BatchHandler,
  options: { signal?: AbortSignal } = {},
): Promise<CollectionSummary> {
  const baseUrl = new URL(definition.request.path, definition.connection.baseUrl);
  const headers = authenticationHeaders(definition, baseUrl);
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
    const payload = await fetchJson(
      definition.limits,
      definition.request.method,
      requestUrl,
      headers,
      options.signal,
      offset,
    );
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
    validateRecords(items, definition.limits.maxRecordBytes, requestUrl, offset);
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

export async function collectHttpSingle(
  definition: SingleCollectionDefinition,
  onBatch: SingleBatchHandler,
  options: { signal?: AbortSignal } = {},
): Promise<SingleCollectionSummary> {
  const requestUrl = new URL(definition.request.path, definition.connection.baseUrl);
  const headers = authenticationHeaders(definition, requestUrl);
  if (options.signal?.aborted) {
    throw collectorError('cancelled', requestUrl, undefined, options.signal.reason);
  }

  const payload = await fetchJson(
    definition.limits,
    definition.request.method,
    requestUrl,
    headers,
    options.signal,
  );
  const items = valueAtPath(payload, definition.response.itemsPath);
  if (!Array.isArray(items)) {
    throw collectorError('invalid_response', requestUrl);
  }
  validateRecords(items, definition.limits.maxRecordBytes, requestUrl);

  let responseMetadata: Record<string, unknown> | undefined;
  if (definition.response.metadataPaths) {
    responseMetadata = {};
    for (const path of definition.response.metadataPaths) {
      const value = valueAtPath(payload, path);
      if (value === undefined) {
        throw collectorError('invalid_response', requestUrl);
      }
      responseMetadata[path] = value;
    }
  }

  if (items.length === 0) return { requests: 1, records: 0 };

  try {
    await onBatch({
      items,
      ...(responseMetadata ? { responseMetadata: Object.freeze(responseMetadata) } : {}),
      signal: options.signal ?? new AbortController().signal,
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw collectorError('cancelled', requestUrl, undefined, error);
    }
    throw collectorError('processing', requestUrl, undefined, error);
  }
  if (options.signal?.aborted) {
    throw collectorError('cancelled', requestUrl, undefined, options.signal.reason);
  }
  return { requests: 1, records: items.length };
}

export type {
  OffsetCollectionDefinition,
  SingleCollectionDefinition,
} from '@oss-scp/plugin-config';
