#!/usr/bin/env node
import { resolve } from 'node:path';
import { preflightConfiguration } from './index';

export function rootFromArgs(args: string[], env: NodeJS.ProcessEnv = process.env): string {
  if (args.length === 0 && env.OSS_SCP_CONFIG_ROOT) return resolve(env.OSS_SCP_CONFIG_ROOT);
  if (args.length === 2 && args[0] === '--root') return resolve(args[1]);
  throw new Error('usage: plugin-config --root <config-root>');
}

export async function run(args = process.argv.slice(2), env = process.env): Promise<number> {
  let root: string;
  try {
    root = rootFromArgs(args, env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'invalid arguments');
    return 2;
  }

  const result = await preflightConfiguration(root);
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`${error.file}${error.path}: ${error.message}`);
    }
    return 1;
  }
  console.log(JSON.stringify({ definitions: result.definitions, menus: result.menus }, null, 2));
  return 0;
}

if (require.main === module) void run().then((code) => { process.exitCode = code; });
