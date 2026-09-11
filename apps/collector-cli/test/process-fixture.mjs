import { executeManualCollection, publicEvent } from '../dist/index.js';
import { clearInterval, setInterval } from 'node:timers';

const scenario = process.argv[2];
const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
const plugin = { id: 'fake-plugin', name: 'Fake', version: '1', transformPath: '/fake.js', data: { types: {} } };
const definition = { plugin, connection: { id: 'fake-source', baseUrl: 'https://example.test' }, request: { method: 'GET', path: '/', format: 'json' }, limits: { timeoutMs: 1, maxResponseBytes: 1, maxRecordBytes: 1 }, response: { itemsPath: 'items' }, pagination: { type: 'single' } };
const storage = { startRun: async () => 'run', finishRun: async () => {}, getCheckpoint: async () => null, commitBatch: async () => {} };
let closed = 0;
const dependencies = {
  validate: () => scenario === 'config' ? { ok: false, errors: [] } : { ok: true, definitions: [definition] },
  connectStorage: async () => ({ storage, resource: { close: async () => { closed += 1; } } }),
  run: async () => {
    if (scenario === 'cancel') await new Promise((_resolve, reject) => {
      if (controller.signal.aborted) reject(new Error('secret cancellation'));
      else controller.signal.addEventListener('abort', () => reject(new Error('secret cancellation')), { once: true });
    });
    if (scenario === 'failed') throw new Error('password=secret token=secret');
    return { runId: 'run-1', status: scenario === 'partial' ? 'partial' : 'success', batches: 1, processed: 2, accepted: scenario === 'partial' ? 1 : 2, rejected: scenario === 'partial' ? 1 : 0, checkpoint: 2 };
  },
  now: () => '2026-09-11T00:00:00.000Z',
};
const keepAlive = scenario === 'cancel' ? setInterval(() => undefined, 1000) : undefined;
if (scenario === 'cancel') process.send?.('ready');
const outcome = await executeManualCollection({ args: ['fake-plugin'], root: process.cwd(), env: {}, signal: controller.signal, dependencies });
if (keepAlive) clearInterval(keepAlive);
process.stdout.write(`${JSON.stringify({ ...publicEvent(outcome, '2026-09-11T00:00:00.000Z'), closed })}\n`);
process.exitCode = outcome.exitCode;
