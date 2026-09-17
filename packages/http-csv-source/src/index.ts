import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { PassThrough, Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { parseCsv, CsvReadError } from '@oss-scp/csv-reader';
import {
  HttpAuthenticationError,
  resolveHttpAuthenticationHeaders,
  type HttpCsvCollectionDefinition,
} from '@oss-scp/plugin-config';

export type HttpCsvErrorCode =
  | 'http_status'
  | 'timeout'
  | 'cancelled'
  | 'download_too_large'
  | 'csv_too_large'
  | 'record_too_large'
  | 'incomplete_download'
  | 'length_mismatch'
  | 'unsupported_encoding'
  | 'invalid_compression'
  | 'invalid_csv'
  | 'processing'
  | 'network'
  | 'authentication';

export class HttpCsvSourceError extends Error {
  constructor(
    public readonly code: HttpCsvErrorCode,
    message: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'HttpCsvSourceError';
    this.status = options?.status;
  }
  readonly status?: number;
}

export interface HttpCsvBatch {
  records: Record<string, string>[];
  complete: boolean;
  signal: AbortSignal;
}

export interface HttpCsvSummary { requests: 1; records: number }
export type HttpCsvBatchHandler = (batch: HttpCsvBatch) => void | Promise<void>;

function safeLocation(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname}`;
}

function sourceError(
  code: HttpCsvErrorCode,
  url: URL,
  cause?: unknown,
  status?: number,
): HttpCsvSourceError {
  const labels: Record<HttpCsvErrorCode, string> = {
    http_status: 'HTTP request failed',
    timeout: 'HTTP CSV request timed out',
    cancelled: 'HTTP CSV collection was cancelled',
    download_too_large: 'HTTP CSV download exceeded its byte limit',
    csv_too_large: 'Decoded CSV exceeded its byte limit',
    record_too_large: 'A CSV record exceeded its byte limit',
    incomplete_download: 'HTTP CSV download ended before completion',
    length_mismatch: 'HTTP CSV content length did not match',
    unsupported_encoding: 'HTTP CSV content encoding is not supported',
    invalid_compression: 'HTTP CSV compression stream is invalid',
    invalid_csv: 'HTTP response was not valid CSV',
    processing: 'HTTP CSV batch processing failed',
    network: 'HTTP CSV request failed',
    authentication: 'HTTP authentication configuration is invalid',
  };
  return new HttpCsvSourceError(code, `${labels[code]}: ${safeLocation(url)}`, {
    cause,
    status,
  });
}

function parseContentLength(response: IncomingMessage, maximum: number, url: URL): number | undefined {
  const raw = response.headers['content-length'];
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw)) throw sourceError('length_mismatch', url);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw sourceError('length_mismatch', url);
  if (value > maximum) throw sourceError('download_too_large', url);
  return value;
}

function decompressor(response: IncomingMessage, url: URL): Transform | undefined {
  const encoding = (response.headers['content-encoding'] ?? 'identity').trim().toLowerCase();
  if (encoding === '' || encoding === 'identity') return undefined;
  if (encoding.includes(',')) throw sourceError('unsupported_encoding', url);
  if (encoding === 'gzip' || encoding === 'x-gzip') return createGunzip();
  if (encoding === 'deflate') return createInflate();
  if (encoding === 'br') return createBrotliDecompress();
  throw sourceError('unsupported_encoding', url);
}

function byteCounter(
  maximum: number,
  code: 'download_too_large' | 'csv_too_large',
  url: URL,
  onBytes?: (bytes: number) => void,
): Transform {
  let bytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      onBytes?.(bytes);
      callback(bytes > maximum ? sourceError(code, url) : null, chunk);
    },
  });
}

function normalizeFailure(
  error: unknown,
  url: URL,
  state: {
    timeout: boolean;
    callerSignal?: AbortSignal;
    transportFailure?: HttpCsvSourceError;
    compressionFailed: boolean;
    response?: IncomingMessage;
    expectedBytes?: number;
  },
): HttpCsvSourceError {
  if (error instanceof HttpCsvSourceError) return error;
  if (state.callerSignal?.aborted) return sourceError('cancelled', url, error);
  if (state.timeout) return sourceError('timeout', url, error);
  if (state.transportFailure) return state.transportFailure;
  if (state.compressionFailed) return sourceError('invalid_compression', url, error);
  if (state.response && !state.response.complete) {
    return sourceError(state.expectedBytes === undefined ? 'incomplete_download' : 'length_mismatch', url, error);
  }
  if (error instanceof CsvReadError) {
    if (error.code === 'CSV_LIMIT') return sourceError('record_too_large', url, error);
    if (error.code === 'CSV_FORMAT') return sourceError('invalid_csv', url, error);
  }
  return sourceError('network', url, error);
}

async function openResponse(
  url: URL,
  signal: AbortSignal,
  authenticationHeaders: Readonly<Record<string, string>>,
): Promise<{ response: IncomingMessage; request: ReturnType<typeof httpRequest> }> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const outgoing = transport(url, {
      method: 'GET',
      headers: { 'accept-encoding': 'gzip, deflate, br', ...authenticationHeaders },
      agent: false,
      signal,
    });
    outgoing.once('response', (response) => resolve({ response, request: outgoing }));
    outgoing.once('error', reject);
    outgoing.end();
  });
}

export async function collectHttpCsv(
  definition: HttpCsvCollectionDefinition,
  onBatch: HttpCsvBatchHandler,
  options: { signal?: AbortSignal } = {},
): Promise<HttpCsvSummary> {
  const url = new URL(definition.request.path, definition.connection.baseUrl);
  let authenticationHeaders: Readonly<Record<string, string>>;
  try {
    authenticationHeaders = resolveHttpAuthenticationHeaders(definition.connection.auth);
  } catch (error) {
    if (error instanceof HttpAuthenticationError) {
      throw new HttpCsvSourceError('authentication', error.message);
    }
    throw sourceError('authentication', url);
  }
  const timeoutController = new AbortController();
  const state: {
    timeout: boolean;
    callerSignal?: AbortSignal;
    transportFailure?: HttpCsvSourceError;
    compressionFailed: boolean;
    response?: IncomingMessage;
    expectedBytes?: number;
  } = { timeout: false, callerSignal: options.signal, compressionFailed: false };
  const timer = setTimeout(() => {
    state.timeout = true;
    timeoutController.abort();
  }, definition.limits.timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;
  let response: IncomingMessage | undefined;
  let request: ReturnType<typeof httpRequest> | undefined;
  let transportDone: Promise<void> | undefined;
  let csvInput: PassThrough | undefined;
  try {
    if (options.signal?.aborted) throw sourceError('cancelled', url, options.signal.reason);
    const opened = await openResponse(url, signal, authenticationHeaders);
    response = opened.response;
    request = opened.request;
    state.response = response;
    const status = response.statusCode ?? 0;
    if (status < 200 || status >= 300) {
      throw sourceError('http_status', url, undefined, status);
    }
    const expectedBytes = parseContentLength(response, definition.limits.maxDownloadBytes, url);
    state.expectedBytes = expectedBytes;
    let wireBytes = 0;
    const wire = byteCounter(definition.limits.maxDownloadBytes, 'download_too_large', url, value => {
      wireBytes = value;
    });
    wire.on('error', error => {
      if (error instanceof HttpCsvSourceError) state.transportFailure = error;
    });
    const decode = decompressor(response, url);
    decode?.once('error', () => { state.compressionFailed = true; });
    const decoded = byteCounter(definition.limits.maxCsvBytes, 'csv_too_large', url);
    decoded.on('error', error => {
      if (error instanceof HttpCsvSourceError) state.transportFailure = error;
    });
    csvInput = new PassThrough({ highWaterMark: 16 * 1024 });
    const streams: Readable[] = decode
      ? [response, wire, decode, decoded, csvInput]
      : [response, wire, decoded, csvInput];
    transportDone = pipeline(streams).then(() => {
      if (expectedBytes !== undefined && wireBytes !== expectedBytes) {
        throw sourceError('length_mismatch', url);
      }
      if (!response?.complete) throw sourceError('incomplete_download', url);
    }).catch(error => {
      if (error instanceof HttpCsvSourceError) state.transportFailure = error;
      throw error;
    });
    transportDone.catch(() => undefined);

    const rows = parseCsv(csvInput, {
      maxBytes: definition.limits.maxCsvBytes,
      maxRecordSize: definition.limits.maxRecordSize,
    });
    const iterator = rows[Symbol.asyncIterator]();
    let count = 0;
    const deliver = async (records: Record<string, string>[], complete: boolean) => {
      try {
        await onBatch({ records, complete, signal });
      } catch (error) {
        if (signal.aborted) throw error;
        throw sourceError('processing', url, error);
      }
      if (signal.aborted) throw signal.reason;
    };
    try {
      let next = await iterator.next();
      if (next.done) {
        await transportDone;
        await deliver([], true);
        return { requests: 1, records: 0 };
      }
      while (!next.done) {
        const records: Record<string, string>[] = [];
        while (records.length < definition.batching.size && !next.done) {
          records.push(next.value);
          next = await iterator.next();
        }
        if (next.done) await transportDone;
        await deliver(records, Boolean(next.done));
        count += records.length;
      }
      return { requests: 1, records: count };
    } finally {
      await iterator.return?.(undefined);
    }
  } catch (error) {
    throw normalizeFailure(error, url, state);
  } finally {
    clearTimeout(timer);
    request?.destroy();
    response?.destroy();
    csvInput?.destroy();
    await transportDone?.catch(() => undefined);
  }
}

export type { HttpCsvCollectionDefinition } from '@oss-scp/plugin-config';
