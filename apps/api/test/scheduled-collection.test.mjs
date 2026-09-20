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
  value.stdout = new PassThrough(); value.stderr = new PassThrough(); value.exitCode = null; value.signalCode = null;
  value.kill = vi.fn(signal => {
    if (stubborn) return true;
    value.signalCode = signal; void Promise.resolve().then(() => value.emit('close', null)); return true;
  });
  return value;
}
function referenceStorage() { return { recordScheduledDuplicate: vi.fn(async () => undefined) }; }
function resultEvent(pluginId, status = 'success', patch = {}) {
  const common = { version: 1, timestamp: '2026-09-19T13:00:01.000Z', event: 'collection_finished', pluginId, status };
  if (status === 'success' || status === 'partial') return { ...common, runId: '123e4567-e89b-42d3-a456-426614174000', batches: 1, processed: 1, accepted: 1, rejected: 0, ...patch };
  if (status === 'duplicate') return { ...common, activeRunId: '123e4567-e89b-42d3-a456-426614174001', scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'Asia/Seoul', ...patch };
  return { ...common, errorCode: 'collection_failed', ...patch };
}
function finish(value, pluginId, status = 'success', code = status === 'partial' ? 2 : status === 'success' || status === 'duplicate' ? 0 : 3, patch = {}) {
  value.stdout.end(`${JSON.stringify(resultEvent(pluginId, status, patch))}\n`);
  value.exitCode = code;
  value.emit('close', code);
}

afterEach(() => { vi.useRealTimers(); writeFileSync(transformPath, transformSource); });
afterAll(() => rmSync(temporary, { recursive: true }));

describe('일일 scheduled 전체 수집', () => {
  it('비활성 일정은 timer와 실행을 만들지 않는다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const spawn = vi.fn();
    const manager = new ScheduledCollectionManager('/config', { enabled: false, timezone: 'Asia/Seoul', time: '22:00' }, referenceStorage(), console, '/collector.js', spawn);
    manager.prepare([definition('one')]); manager.start(); await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(spawn).not.toHaveBeenCalled();
    await manager.close();
  });

  it('예정 시각마다 저장형 snapshot만 metadata와 함께 독립 spawn하고 하루 한 번 실행한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const children = [];
    const spawn = vi.fn(() => { const value = child(); children.push(value); return value; });
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, referenceStorage(), console, '/collector.js', spawn);
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
    finish(children[0], 'one'); finish(children[1], 'two');
    await manager.close();
  });

  it('기동 뒤 config와 transform 파일이 바뀌어도 준비한 immutable snapshot만 전달한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const configured = definition('one');
    const spawn = vi.fn(() => child());
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, referenceStorage(), console, '/collector.js', spawn);
    manager.prepare([configured]);
    configured.request.path = '/changed';
    writeFileSync(transformPath, 'throw new Error("changed transform executed");\n');
    manager.start(); await vi.advanceTimersByTimeAsync(60_000);
    const request = spawn.mock.calls[0][0];
    expect(Object.isFrozen(request.snapshot)).toBe(true);
    expect(Object.isFrozen(request.snapshot.definition)).toBe(true);
    expect(request.snapshot.definition.request.path).toBe('/items');
    expect(Buffer.from(request.snapshot.transform.sourceBase64, 'base64').toString('utf8')).toBe(transformSource);
    finish(spawn.mock.results[0].value, 'one');
    await manager.close();
  });

  it('필수 runtime·DB·대상 credential만 전달하고 AUTH·LDAP 및 무관 환경은 차단한다', () => {
    const target = definition('one', { connection: { id: 'source', baseUrl: 'https://example.test', auth: { type: 'bearer', tokenRef: { env: 'SOURCE_TOKEN' } } } });
    const environment = scheduledChildEnvironment({
      PATH: '/bin', PLATFORM_DB_PASSWORD: 'db-secret', PLATFORM_DB_UNKNOWN_SECRET: 'unknown-db-secret', SOURCE_TOKEN: 'source-secret',
      AUTH_SESSION_SECRET: 'auth-secret', LDAP_BIND_PASSWORD: 'ldap-secret', RANDOM_SECRET: 'other-secret',
    }, target, { configRoot: '/config', expectedRevision: 'a'.repeat(64), scheduledAt: '2026-09-19T13:00:00.000Z', timezone: 'Asia/Seoul' });
    expect(environment).toMatchObject({ PATH: '/bin', PLATFORM_DB_PASSWORD: 'db-secret', SOURCE_TOKEN: 'source-secret', OSS_SCP_COLLECTION_TRIGGER: 'scheduled' });
    expect(environment).not.toHaveProperty('AUTH_SESSION_SECRET');
    expect(environment).not.toHaveProperty('LDAP_BIND_PASSWORD');
    expect(environment).not.toHaveProperty('RANDOM_SECRET');
    expect(environment).not.toHaveProperty('PLATFORM_DB_UNKNOWN_SECRET');

    const forbiddenReference = { ...target, connection: { ...target.connection, auth: { type: 'bearer', tokenRef: { env: 'AUTH_SOURCE_TOKEN' } } } };
    expect(scheduledChildEnvironment({ AUTH_SOURCE_TOKEN: 'secret' }, forbiddenReference, { configRoot: '/config', expectedRevision: 'a'.repeat(64), scheduledAt: '2026-09-19T13:00:00.000Z', timezone: 'UTC' })).not.toHaveProperty('AUTH_SOURCE_TOKEN');
  });

  it.each(['NODE_OPTIONS', 'NODE_PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT', 'LIBPATH', 'SHLIB_PATH', 'OPENSSL_CONF', 'OPENSSL_MODULES', 'DYLD_INSERT_LIBRARIES'])('scheduled credential envRef %s는 snapshot 준비 전에 거부한다', env => {
    const target = definition('one', { connection: { id: 'source', baseUrl: 'https://example.test', auth: { type: 'bearer', tokenRef: { env } } } });
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'UTC', time: '00:00' }, referenceStorage(), console, '/collector.js', vi.fn());
    expect(() => manager.prepare([target])).toThrowError('scheduled collection credential environment name is not allowed');
    const disabled = new ScheduledCollectionManager('/config', { enabled: false, timezone: 'UTC', time: '00:00' }, referenceStorage(), console, '/collector.js', vi.fn());
    expect(() => disabled.prepare([target])).not.toThrow();
  });

  it('빈/live-only snapshot은 실행 이력 없이 다음 일정을 유지한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const spawn = vi.fn();
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, referenceStorage(), console, '/collector.js', spawn);
    manager.start([{ ...definition('live'), mode: 'live', persistence: 'none' }]);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 + 60_000);
    expect(spawn).not.toHaveBeenCalled();
    await manager.close();
  });

  it('재시작은 놓친 일정을 보충하지 않고 다음 발생만 예약한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-21T14:00:00.000Z'));
    const spawn = vi.fn(() => child());
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, referenceStorage(), console, '/collector.js', spawn);
    manager.start([definition('one')]);
    await vi.advanceTimersByTimeAsync(22 * 60 * 60 * 1000);
    expect(spawn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(spawn).toHaveBeenCalledOnce();
    finish(spawn.mock.results[0].value, 'one');
    await manager.close();
  });

  it('spawn/runtime 실패를 대상별로 격리하고 민감 stderr를 노출하지 않는다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const errors = []; const second = child();
    const spawn = vi.fn(request => { if (request.pluginId === 'one') throw new Error('password=secret'); return second; });
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, referenceStorage(), { error: value => errors.push(value) }, '/collector.js', spawn);
    manager.start([definition('one'), definition('two')]); await vi.advanceTimersByTimeAsync(60_000);
    second.stderr.write('token=secret\n'); finish(second, 'two', 'failed');
    expect(spawn.mock.calls.map(([request]) => request.pluginId)).toEqual(['one', 'two']);
    expect(errors).toEqual(['정기 수집 프로세스를 시작하지 못했습니다: one', '정기 수집 실패: two']);
    expect(JSON.stringify(errors)).not.toMatch(/password|token|secret/);
    await manager.close();
  });

  it('process stdout의 duplicate event만 검증해 active run 참조를 영속화한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const children = new Map();
    const spawn = vi.fn(request => { const value = child(); children.set(request.pluginId, value); return value; });
    const references = referenceStorage();
    const errors = [];
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, references, { error: value => errors.push(value) }, '/collector.js', spawn);
    manager.start([definition('valid'), definition('polluted'), definition('oversized')]);
    await vi.advanceTimersByTimeAsync(60_000);
    finish(children.get('valid'), 'valid', 'duplicate');
    children.get('polluted').stdout.end(`untrusted\n${JSON.stringify(resultEvent('polluted', 'duplicate'))}\n`);
    children.get('polluted').exitCode = 0; children.get('polluted').emit('close', 0);
    children.get('oversized').stdout.end('x'.repeat(16 * 1024 + 1));
    children.get('oversized').exitCode = 0; children.get('oversized').emit('close', 0);
    await manager.close();
    expect(references.recordScheduledDuplicate).toHaveBeenCalledOnce();
    expect(references.recordScheduledDuplicate).toHaveBeenCalledWith({
      activeRunId: '123e4567-e89b-42d3-a456-426614174001', pluginId: 'valid',
      sourceId: 'valid-source', scopeType: 'full', scopeKey: '', configRevision: expect.stringMatching(/^[a-f0-9]{64}$/),
      scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'Asia/Seoul', observedAt: '2026-09-19T13:00:01.000Z',
    });
    expect(errors).toEqual([
      '정기 수집 결과가 올바르지 않습니다: polluted',
      '정기 수집 결과가 올바르지 않습니다: oversized',
    ]);
  });

  it('exit 상태 뒤 실제 close까지 기다려 duplicate 결과를 drain한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const exited = child(true); const spawn = vi.fn(() => exited); const references = referenceStorage();
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, references, console, '/collector.js', spawn, () => new Date(), {}, 100, 50, 75);
    manager.start([definition('one')]); await vi.advanceTimersByTimeAsync(60_000);
    exited.stdout.end(`${JSON.stringify(resultEvent('one', 'duplicate'))}\n`);
    exited.exitCode = 0; exited.emit('exit', 0);
    let closed = false; const closing = manager.close().then(() => { closed = true; });
    await Promise.resolve();
    expect(exited.kill).not.toHaveBeenCalled();
    expect(closed).toBe(false);
    exited.emit('close', 0);
    await closing;
    expect(references.recordScheduledDuplicate).toHaveBeenCalledOnce();
  });

  it('종료 중 duplicate 저장이 끝나지 않아도 고정 drain 상한 뒤 반환한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const duplicate = child(); const spawn = vi.fn(() => duplicate);
    const references = { recordScheduledDuplicate: vi.fn(() => new Promise(() => undefined)) };
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, references, console, '/collector.js', spawn, () => new Date(), {}, 100, 50, 75);
    manager.start([definition('one')]); await vi.advanceTimersByTimeAsync(60_000);
    finish(duplicate, 'one', 'duplicate');
    let closed = false; const closing = manager.close().then(() => { closed = true; });
    await vi.advanceTimersByTimeAsync(74); expect(closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await closing;
    expect(closed).toBe(true);
    expect(references.recordScheduledDuplicate).toHaveBeenCalledOnce();
  });

  it('종료 상한 뒤 도착한 late close는 결과 처리나 DB 저장을 시작하지 않는다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const late = child(true); const spawn = vi.fn(() => late); const references = referenceStorage();
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, references, console, '/collector.js', spawn, () => new Date(), {}, 100, 50, 75);
    manager.start([definition('one')]); await vi.advanceTimersByTimeAsync(60_000);
    const closing = manager.close();
    await vi.advanceTimersByTimeAsync(150); await closing;
    late.stdout.end(`${JSON.stringify(resultEvent('one', 'duplicate'))}\n`);
    late.exitCode = 0; late.emit('close', 0);
    await Promise.resolve();
    expect(references.recordScheduledDuplicate).not.toHaveBeenCalled();
  });

  it('종료 시 SIGTERM grace 뒤 SIGKILL하고 close 대기 상한을 보장한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const running = child(true); const spawn = vi.fn(() => running);
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, referenceStorage(), console, '/collector.js', spawn, () => new Date(), {}, 100, 50);
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
