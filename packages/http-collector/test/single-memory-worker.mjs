import { createServer } from 'node:http';
import { collectHttpSingle } from '../dist/index.js';

if (typeof globalThis.gc !== 'function') throw new Error('run with --expose-gc');
const count = Number(process.argv[2]);
const server = createServer((request, response) => {
  const requestedCount = Number(new URL(request.url, 'http://localhost').searchParams.get('count'));
  const items = Array.from({ length: requestedCount }, (_, index) => ({
    id: index,
    payload: 'x'.repeat(4096),
  }));
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ items, complete: true }));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const baseDefinition = {
    plugin: { id: 'memory', name: 'Memory', version: '0.1.0' },
    connection: { id: 'memory', baseUrl: `http://127.0.0.1:${server.address().port}` },
    response: { itemsPath: 'items', metadataPaths: ['complete'] },
    pagination: { type: 'single' },
    limits: { timeoutMs: 5000, maxResponseBytes: 16 * 1024 * 1024, maxRecordBytes: 8192 },
  };
  await collectHttpSingle({
    ...baseDefinition,
    request: { method: 'GET', path: '/records?count=1', format: 'json' },
  }, async () => {});
  globalThis.gc();
  const baseline = process.memoryUsage().heapUsed;
  const summary = await collectHttpSingle({
    ...baseDefinition,
    request: { method: 'GET', path: `/records?count=${count}`, format: 'json' },
  }, async () => {});
  globalThis.gc();
  const retainedBytes = Math.max(0, process.memoryUsage().heapUsed - baseline);
  process.stdout.write(JSON.stringify({ summary, retainedBytes }));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
