#!/usr/bin/env node
import { collectionProcessInvocation, configRoot, executeManualCollection, parsePluginId, publicEvent, readScheduledCollectionSnapshot, type CliOutcome } from './index.js';

const controller = new AbortController();
const abort = (): void => controller.abort();
process.once('SIGINT', abort);
process.once('SIGTERM', abort);

let outcome: CliOutcome;
try {
  const invocation = collectionProcessInvocation(process.env);
  const args = process.argv.slice(2);
  const scheduledSnapshot = invocation.trigger === 'scheduled'
    ? await readScheduledCollectionSnapshot(process.stdin, parsePluginId(args), invocation.expectedConfigRevision!)
    : undefined;
  outcome = await executeManualCollection({
    args,
    root: configRoot(process.env),
    env: process.env,
    signal: controller.signal,
    ...invocation,
    ...(scheduledSnapshot ? { scheduledSnapshot } : {}),
  });
} catch {
  outcome = { exitCode: 1, status: 'failed', errorCode: 'repository_config' };
}
process.stdout.write(`${JSON.stringify(publicEvent(outcome, new Date().toISOString()))}\n`);
process.exitCode = outcome.exitCode;
process.removeListener('SIGINT', abort);
process.removeListener('SIGTERM', abort);
