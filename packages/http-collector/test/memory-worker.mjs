import { createServer } from 'node:http';
import { collectHttpOffset } from '../dist/index.js';

if (typeof globalThis.gc !== 'function') throw new Error('run with --expose-gc');
const pages = Number(process.argv[2]);
const limit = 32;
const total = pages * limit;
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const offset = Number(url.searchParams.get('offset'));
  const items = Array.from({ length: Math.min(limit, total - offset) }, (_, index) => ({
    id: offset + index,
    payload: 'x'.repeat(4096),
  }));
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ total, items }));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
globalThis.gc();
const baseline = process.memoryUsage().heapUsed;
let peak = baseline;
try {
  await collectHttpOffset({
    plugin: { id: 'memory', name: 'Memory', version: '0.1.0' },
    connection: { id: 'memory', baseUrl: `http://127.0.0.1:${server.address().port}` },
    request: { method: 'GET', path: '/records', format: 'json' },
    response: { itemsPath: 'items', totalPath: 'total' },
    pagination: { type: 'offset', offsetParam: 'offset', limitParam: 'limit', start: 0, limit },
    limits: { timeoutMs: 5000, maxResponseBytes: 1024 * 1024, maxRecordBytes: 8192 },
  }, async () => {
    globalThis.gc();
    peak = Math.max(peak, process.memoryUsage().heapUsed);
  });
  globalThis.gc();
  peak = Math.max(peak, process.memoryUsage().heapUsed);
  process.stdout.write(JSON.stringify({ increase: Math.max(0, peak - baseline) }));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
