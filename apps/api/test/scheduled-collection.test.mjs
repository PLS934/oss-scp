import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScheduledCollectionManager } from '../dist/scheduled-collection.js';

function definition(id) { return { plugin: { id } }; }
function child() {
  const value = new EventEmitter();
  value.stderr = new PassThrough(); value.exitCode = null; value.signalCode = null;
  value.kill = vi.fn(() => { value.signalCode = 'SIGTERM'; void Promise.resolve().then(() => value.emit('close', null)); return true; });
  return value;
}

afterEach(() => { vi.useRealTimers(); });

describe('일일 scheduled 전체 수집', () => {
  it('비활성 일정은 timer와 실행을 만들지 않는다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const spawn = vi.fn();
    const manager = new ScheduledCollectionManager('/config', { enabled: false, timezone: 'Asia/Seoul', time: '22:00' }, console, '/collector.js', spawn);
    manager.start([definition('one')]); await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(spawn).not.toHaveBeenCalled();
    await manager.close();
  });

  it('예정 시각마다 저장형 대상만 metadata와 함께 독립 spawn하고 하루 한 번 실행한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const children = [];
    const spawn = vi.fn(() => { const value = child(); children.push(value); return value; });
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, console, '/collector.js', spawn);
    manager.start([definition('one'), { ...definition('live'), mode: 'live', persistence: 'none' }, definition('two')]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(spawn.mock.calls).toEqual([
      ['one', '/config', '/collector.js', expect.stringMatching(/^[a-f0-9]{64}$/), '2026-09-19T13:00:00.000Z', 'Asia/Seoul'],
      ['two', '/config', '/collector.js', expect.stringMatching(/^[a-f0-9]{64}$/), '2026-09-19T13:00:00.000Z', 'Asia/Seoul'],
    ]);
    await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000);
    expect(spawn).toHaveBeenCalledTimes(2);
    for (const value of children) { value.exitCode = 0; value.emit('close', 0); }
    await manager.close();
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
    const spawn = vi.fn(pluginId => { if (pluginId === 'one') throw new Error('password=secret'); return second; });
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, { error: value => errors.push(value) }, '/collector.js', spawn);
    manager.start([definition('one'), definition('two')]); await vi.advanceTimersByTimeAsync(60_000);
    second.stderr.write('token=secret\n'); second.exitCode = 3; second.emit('close', 3);
    expect(spawn.mock.calls.map(([id]) => id)).toEqual(['one', 'two']);
    expect(errors).toEqual(['정기 수집 프로세스를 시작하지 못했습니다: one', '정기 수집 실패: two']);
    expect(JSON.stringify(errors)).not.toMatch(/password|token|secret/);
    await manager.close();
  });

  it('종료 시 pending timer를 취소하고 시작된 자식에 SIGTERM을 전달한다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:59:00.000Z'));
    const running = child(); const spawn = vi.fn(() => running);
    const manager = new ScheduledCollectionManager('/config', { enabled: true, timezone: 'Asia/Seoul', time: '22:00' }, console, '/collector.js', spawn);
    manager.start([definition('one')]); await vi.advanceTimersByTimeAsync(60_000);
    await manager.close();
    expect(running.kill).toHaveBeenCalledWith('SIGTERM');
    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
