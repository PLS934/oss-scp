import { basename, isAbsolute, win32 } from 'node:path';
import type { ConfigurationIssue } from '@oss-scp/plugin-config';

function escapeControls(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f)
      ? `\\u${code.toString(16).padStart(4, '0')}`
      : character;
  }).join('');
}

function safeFile(file: string): string {
  const escaped = escapeControls(file);
  if (isAbsolute(escaped)) return basename(escaped);
  if (win32.isAbsolute(escaped)) return win32.basename(escaped);
  return escaped;
}

export function formatConfigurationIssues(errors: readonly ConfigurationIssue[]): string {
  return errors
    .map((error) => `${safeFile(error.file)} ${escapeControls(error.path)}: ${escapeControls(error.message)}`)
    .join('\n');
}
