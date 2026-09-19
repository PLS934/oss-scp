import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { setImmediate } from 'node:timers';
import { fileURLToPath } from 'node:url';
import { collectHttpSingle } from '../dist/index.js';

const workerPath = fileURLToPath(import.meta.url);

if (process.argv[2] === 'server') {
  const server = createServer((request, response) => {
    const requestedCount = Number(
      new URL(request.url, 'http://localhost').searchParams.get('count'),
    );
    const items = Array.from({ length: requestedCount }, (_, index) => ({
      id: index,
      payload: 'x'.repeat(4096),
    }));
    const body = JSON.stringify({ items, complete: true });
    response.writeHead(200, {
      connection: 'close',
      'content-type': 'application/json',
    });
    response.end(body);
    process.send?.({
      type: 'served',
      count: requestedCount,
      payloadBytes: Buffer.byteLength(body),
    });
  });
  process.on('message', (message) => {
    if (message?.type !== 'shutdown') return;
    server.close((error) => process.exit(error ? 1 : 0));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.send?.({ type: 'ready', port: server.address().port });
} else {
  if (typeof globalThis.gc !== 'function') throw new Error('run with --expose-gc');

  const count = Number(process.argv[2]);
  const retainItems = process.argv.includes('--retain-items');
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('count must be a positive integer');
  }

  function waitForMessage(child, predicate, label) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error(`timed out waiting for ${label}`)), 5000);
      function cleanup() {
        clearTimeout(timeout);
        child.off('message', onMessage);
        child.off('error', finish);
        child.off('exit', onExit);
      }
      function finish(error, value) {
        cleanup();
        if (error) reject(error);
        else resolve(value);
      }
      function onMessage(message) {
        if (predicate(message)) finish(undefined, message);
      }
      function onExit(code, signal) {
        finish(new Error(`${label} server exited early (code=${code}, signal=${signal})`));
      }
      child.on('message', onMessage);
      child.on('error', finish);
      child.on('exit', onExit);
    });
  }

  async function stabilizeHeap() {
    const samples = [];
    for (let turn = 0; turn < 6; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      globalThis.gc();
      samples.push(process.memoryUsage().heapUsed);
    }
    return Math.min(...samples.slice(2));
  }

  const child = fork(workerPath, ['server'], { silent: true });
  let serverStderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { serverStderr += chunk; });
  child.stdout.resume();

  let serverResult;
  try {
    const ready = await waitForMessage(
      child,
      (message) => message?.type === 'ready',
      'readiness',
    );
    const baseDefinition = {
      plugin: { id: 'memory', name: 'Memory', version: '0.1.0' },
      connection: { id: 'memory', baseUrl: `http://127.0.0.1:${ready.port}` },
      response: { itemsPath: 'items', metadataPaths: ['complete'] },
      pagination: { type: 'single' },
      limits: { timeoutMs: 5000, maxResponseBytes: 16 * 1024 * 1024, maxRecordBytes: 8192 },
    };
    const collect = async (requestedCount, onBatch) => {
      const served = waitForMessage(
        child,
        (message) => message?.type === 'served' && message.count === requestedCount,
        `payload ${requestedCount}`,
      );
      const summary = await collectHttpSingle({
        ...baseDefinition,
        request: { method: 'GET', path: `/records?count=${requestedCount}`, format: 'json' },
      }, onBatch);
      return { summary, payloadBytes: (await served).payloadBytes };
    };

    await collect(1, async () => {});
    const baselineHeapBytes = await stabilizeHeap();
    const retained = [];
    const { summary, payloadBytes } = await collect(count, async (batch) => {
      if (retainItems) retained.push(batch.items);
    });
    const measuredHeapBytes = await stabilizeHeap();

    const exit = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    child.send({ type: 'shutdown' });
    serverResult = await exit;

    process.stdout.write(JSON.stringify({
      schemaVersion: 1,
      count,
      payloadBytes,
      summary,
      retainedBytes: Math.max(0, measuredHeapBytes - baselineHeapBytes),
      retainedItemCount: retained.reduce((total, items) => total + items.length, 0),
      server: {
        exitCode: serverResult.code,
        signal: serverResult.signal,
        stderr: serverStderr,
      },
    }));
  } finally {
    if (serverResult === undefined && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }
}
