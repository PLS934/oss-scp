#!/usr/bin/env node
import { executeManualCollection, findRepositoryRoot, publicEvent, type CliOutcome } from './index.js';

const controller = new AbortController();
const abort = (): void => controller.abort();
process.once('SIGINT', abort);
process.once('SIGTERM', abort);

let outcome: CliOutcome;
try {
  outcome = await executeManualCollection({
    args: process.argv.slice(2),
    root: findRepositoryRoot(process.cwd()),
    env: process.env,
    signal: controller.signal,
  });
} catch {
  outcome = { exitCode: 1, status: 'failed', errorCode: 'repository_config' };
}
process.stdout.write(`${JSON.stringify(publicEvent(outcome, new Date().toISOString()))}\n`);
process.exitCode = outcome.exitCode;
process.removeListener('SIGINT', abort);
process.removeListener('SIGTERM', abort);
