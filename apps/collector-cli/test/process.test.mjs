import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const fixture = resolve(import.meta.dirname, 'process-fixture.mjs');
async function run(scenario) {
  const child = spawn(process.execPath, [fixture, scenario], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  if (scenario === 'cancel') { await once(child, 'message'); child.kill('SIGTERM'); }
  const [code] = await once(child, 'exit');
  return { code, stdout, stderr, event: JSON.parse(stdout) };
}

describe('실제 프로세스 종료 계약', () => {
  for (const [scenario, code, status] of [['success', 0, 'success'], ['config', 1, 'failed'], ['partial', 2, 'partial'], ['failed', 3, 'failed'], ['cancel', 130, 'cancelled']]) {
    it(`${scenario} 상태를 ${code}로 종료한다`, async () => {
      const result = await run(scenario);
      expect(result.code).toBe(code);
      expect(result.stderr).toBe('');
      expect(result.stdout.trim().split('\n')).toHaveLength(1);
      expect(result.event).toMatchObject({ version: 1, status, closed: scenario === 'config' ? 0 : 1 });
      expect(result.stdout).not.toMatch(/password=secret|token=secret|stack/i);
    });
  }
});
