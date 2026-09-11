#!/usr/bin/env node
import { resolve } from 'node:path';
import { validateRepository } from './index';

function rootFromArgs(args: string[]): string {
  if (args.length === 0) return process.cwd();
  if (args.length === 2 && args[0] === '--root') return resolve(args[1]);
  throw new Error('usage: plugin-config --root <repository>');
}

export function run(args = process.argv.slice(2)): number {
  let root: string;
  try {
    root = rootFromArgs(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'invalid arguments');
    return 2;
  }

  const result = validateRepository(root);
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`${error.file}${error.path}: ${error.message}`);
    }
    return 1;
  }
  console.log(JSON.stringify({ definitions: result.definitions, menus: result.menus }, null, 2));
  return 0;
}

if (require.main === module) process.exitCode = run();
