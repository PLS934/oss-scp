import { createServer } from 'node:http';
import { collectHttpCsv } from '../dist/index.js';

const rows = Number(process.argv[2]);
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/csv' });
  response.write('id,value\n');
  let index = 0;
  const write = () => {
    while (index < rows) {
      const ready = response.write(`${index},${'x'.repeat(1000)}\n`);
      index += 1;
      if (!ready) return response.once('drain', write);
    }
    response.end();
  };
  write();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
globalThis.gc();
const before = process.memoryUsage().heapUsed;
let peak = before;
try {
  await collectHttpCsv({
    plugin: { id: 'memory', name: 'Memory', version: '0.1.0' },
    connection: { id: 'memory', baseUrl: origin },
    request: { transport: 'http', method: 'GET', path: '/', format: 'csv' },
    batching: { size: 20 },
    limits: { timeoutMs: 30000, maxDownloadBytes: 100 * 1024 * 1024, maxCsvBytes: 100 * 1024 * 1024, maxRecordSize: 2048 },
  }, async () => {
    globalThis.gc();
    peak = Math.max(peak, process.memoryUsage().heapUsed);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  process.stdout.write(JSON.stringify({ increase: peak - before }));
} finally {
  await new Promise(resolve => server.close(resolve));
}
