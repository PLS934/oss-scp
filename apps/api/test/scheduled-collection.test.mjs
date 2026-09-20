import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { ScheduledCollectionManager, scheduledChildEnvironment } from '../dist/scheduled-collection.js';

const temporary = mkdtempSync(join(tmpdir(), 'oss-scp-scheduled-test-'));
const transformPath = join(temporary, 'transform.js');
const transformSource = 'exports.transform = input => input;\n';
writeFileSync(transformPath, transformSource);
const transformDigest = createHash('sha256').update(transformSource).digest('hex');

function definition(id, patch = {}) {
  return {
    plugin: { id, name: id, version: '1.0.0', transformPath, transformDigest, data: { types: {} } },
    connection: { id: `${id}-source`, baseUrl: 'https://example.test' },
    request: { method: 'GET', path: '/items', format: 'json' },
    limits: { timeoutMs: 1000, maxResponseBytes: 1000, maxRecordBytes: 100 },
    response: { itemsPath: 'items' }, pagination: { type: 'single' }, ...patch,
  };
}
function child(stubborn = false) {
  const value = new EventEmitter();
  value.stderr = new PassThrough(); value.exitCode = null; value.signalCode = null;
  value.kill = vi.fn(signal => {
    if (stubborn) return true;
    value.signalCode = signal; void Promise.resolve().then(() => value.emit('close', null)); return true;
  });
  return value;
}

afterEach(() => { vi.useRealTimers(); writeFileSync(transformPath, transformSource); });
afterAll(() => rmSync(temporary, { recursive: true }));

describe('일일 scheduled 전체 수집', () => {
  it('비활성 일정은 timer와 실행을 만들지 않는다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const spawn = vi.fn();
    const manager = new ScheduledCollectionManager('/config', { enabled: false, timezone: 'Asia/Seoul', time: '22:00' }, console, '/collector.js', spawn);
    manager.prepare([definition('one')]); manager.start(); await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(spawn).not.toHaveBeenCalled();
    await manager.close();
  });

  it('예정 시각마다 저장형 snapshot만 metadata와 함께 독립 spawn하고 하루 한 번 실행한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const children = [];
    const spawn = vi.fn(() => { const value = child(); children.push(value); return value; });
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, console, '/collector.js', spawn);
    manager.start([definition('one'), { ...definition('live'), mode: 'live', persistence: 'none' }, definition('two')]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls.map(([request]) => request)).toEqual([
      expect.objectContaining({ pluginId: 'one', configRoot: '/config', processPath: '/collector.js', expectedRevision: expect.stringMatching(/^[a-f0-9]{64}$/), scheduledAt: '2026-09-19T13:00:00.000Z', timezone: 'Asia/Seoul' }),
      expect.objectContaining({ pluginId: 'two', configRoot: '/config', processPath: '/collector.js', expectedRevision: expect.stringMatching(/^[a-f0-9]{64}$/), scheduledAt: '2026-09-19T13:00:00.000Z', timezone: 'Asia/Seoul' }),
    ]);
    expect(spawn.mock.calls[0][0].snapshot.transform).toEqual({ digest: transformDigest, sourceBase64: Buffer.from(transformSource).toString('base64') });
    await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000);
    expect(spawn).toHaveBeenCalledTimes(2);
    for (const value of children) { value.exitCode = 0; value.emit('close', 0); }
    await manager.close();
  });

  it('기동 뒤 config와 transform 파일이 바뀌어도 준비한 immutable snapshot만 전달한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const configured = definition('one');
    const spawn = vi.fn(() => child());
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, console, '/collector.js', spawn);
    manager.prepare([configured]);
    configured.request.path = '/changed';
    writeFileSync(transformPath, 'throw new Error("changed transform executed");\n');
    manager.start(); await vi.advanceTimersByTimeAsync(60_000);
    const request = spawn.mock.calls[0][0];
    expect(Object.isFrozen(request.snapshot)).toBe(true);
    expect(Object.isFrozen(request.snapshot.definition)).toBe(true);
    expect(request.snapshot.definition.request.path).toBe('/items');
    expect(Buffer.from(request.snapshot.transform.sourceBase64, 'base64').toString('utf8')).toBe(transformSource);
    spawn.mock.results[0].value.exitCode = 0; spawn.mock.results[0].value.emit('close', 0);
    await manager.close();
  });

  it('필수 runtime·DB·대상 credential만 전달하고 AUTH·LDAP 및 무관 환경은 차단한다', () => {
    const target = definition('one', { connection: { id: 'source', baseUrl: 'https://example.test', auth: { type: 'bearer', tokenRef: { env: 'SOURCE_TOKEN' } } } });
    const environment = scheduledChildEnvironment({
      PATH: '/bin', PLATFORM_DB_PASSWORD: 'db-secret', SOURCE_TOKEN: 'source-secret',
      AUTH_SESSION_SECRET: 'auth-secret', LDAP_BIND_PASSWORD: 'ldap-secret', RANDOM_SECRET: 'other-secret',
    }, target, { configRoot: '/config', expectedRevision: 'a'.repeat(64), scheduledAt: '2026-09-19T13:00:00.000Z', timezone: 'Asia/Seoul' });
    expect(environment).toMatchObject({ PATH: '/bin', PLATFORM_DB_PASSWORD: 'db-secret', SOURCE_TOKEN: 'source-secret', OSS_SCP_COLLECTION_TRIGGER: 'scheduled' });
    expect(environment).not.toHaveProperty('AUTH_SESSION_SECRET');
    expect(environment).not.toHaveProperty('LDAP_BIND_PASSWORD');
    expect(environment).not.toHaveProperty('RANDOM_SECRET');

    const forbiddenReference = { ...target, connection: { ...target.connection, auth: { type: 'bearer', tokenRef: { env: 'AUTH_SOURCE_TOKEN' } } } };
    expect(scheduledChildEnvironment({ AUTH_SOURCE_TOKEN: 'secret' }, forbiddenReference, { configRoot: '/config', expectedRevision: 'a'.repeat(64), scheduledAt: '2026-09-19T13:00:00.000Z', timezone: 'UTC' })).not.toHaveProperty('AUTH_SOURCE_TOKEN');
  });

  it('빈/live-only snapshot은 실행 이력 없이 다음 일정을 유지한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const spawn = vi.fn();
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, console, '/collector.js', spawn);
    manager.start([{ ...definition('live'), mode: 'live', persistence: 'none' }]);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 + 60_000);
    expect(spawn).not.toHaveBeenCalled();
    await manager.close();
  });

  it('재시작은 놓친 일정을 보충하지 않고 다음 발생만 예약한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-21T14:00:00.000Z'));
    const spawn = vi.fn(() => child());
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, console, '/collector.js', spawn);
    manager.start([definition('one')]);
    await vi.advanceTimersByTimeAsync(22 * 60 * 60 * 1000);
    expect(spawn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(spawn).toHaveBeenCalledOnce();
    spawn.mock.results[0].value.exitCode = 0; spawn.mock.results[0].value.emit('close', 0);
    await manager.close();
  });

  it('spawn/runtime 실패를 대상별로 격리하고 민감 stderr를 노출하지 않는다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const errors = []; const second = child();
    const spawn = vi.fn(request => { if (request.pluginId === 'one') throw new Error('password=secret'); return second; });
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, { error: value => errors.push(value) }, '/collector.js', spawn);
    manager.start([definition('one'), definition('two')]); await vi.advanceTimersByTimeAsync(60_000);
    second.stderr.write('token=secret\n'); second.exitCode = 3; second.emit('close', 3);
    expect(spawn.mock.calls.map(([request]) => request.pluginId)).toEqual(['one', 'two']);
    expect(errors).toEqual(['정기 수집 프로세스를 시작하지 못했습니다: one', '정기 수집 실패: two']);
    expect(JSON.stringify(errors)).not.toMatch(/password|token|secret/);
    await manager.close();
  });

  it('종료 시 SIGTERM grace 뒤 SIGKILL하고 close 대기 상한을 보장한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const running = child(true); const spawn = vi.fn(() => running);
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, console, '/collector.js', spawn, () => new Date(), {}, 100, 50);
    manager.start([definition('one')]); await vi.advanceTimersByTimeAsync(60_000);
    const closing = manager.close();
    expect(running.kill).toHaveBeenCalledWith('SIGTERM');
    await vi.advanceTimersByTimeAsync(100);
    expect(running.kill).toHaveBeenCalledWith('SIGKILL');
    await vi.advanceTimersByTimeAsync(50);
    await closing;
    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
