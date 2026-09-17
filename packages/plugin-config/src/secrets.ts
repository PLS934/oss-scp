import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import type { SecretReference } from './types';

const MAX_SECRET_BYTES = 64 * 1024;

export function resolveSecret(reference: SecretReference, options: { env?: Readonly<Record<string, string | undefined>>; secretRoot?: string } = {}): string {
  if ('env' in reference) {
    const value = (options.env ?? process.env)[reference.env];
    if (!value) throw new Error('required secret environment variable is unavailable');
    return value;
  }
  const secretRoot = options.secretRoot;
  if (!secretRoot || isAbsolute(reference.file)) throw new Error('secret file is outside the configured secret root');
  const root = realpathSync(secretRoot);
  const candidate = resolve(root, reference.file);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) throw new Error('secret file is outside the configured secret root');
  if (lstatSync(candidate).isSymbolicLink()) throw new Error('secret file symbolic links are not allowed');
  const actual = realpathSync(candidate);
  if (actual !== root && !actual.startsWith(`${root}${sep}`)) throw new Error('secret file is outside the configured secret root');
  const value = readFileSync(actual);
  if (value.byteLength === 0 || value.byteLength > MAX_SECRET_BYTES) throw new Error('secret file size is invalid');
  return value.toString('utf8').replace(/[\r\n]+$/, '');
}
