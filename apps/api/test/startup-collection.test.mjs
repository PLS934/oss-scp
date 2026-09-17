import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { StartupCollectionManager } from '../dist/startup-collection.js';

function definition(id) { return { plugin: { id } }; }
function child() {
  const value = new EventEmitter();
  value.stderr = new PassThrough();
  value.exitCode = null; value.signalCode = null;
  value.kill = vi.fn(() => { value.signalCode = 'SIGTERM'; void Promise.resolve().then(() => value.emit('close', null)); return true; });
  return value;
}

describe('기동 전체 수집 프로세스', () => {
  it('빈 registry에서는 작업을 만들지 않고 등록 대상마다 독립 실행한다', async () => {
    const calls = []; const children = [];
    const spawn = (pluginId, root, path) => { calls.push({ pluginId, root, path }); const value = child(); children.push(value); return value; };
    const manager = new StartupCollectionManager('/config', console, '/collector.js', spawn);
    manager.start([]); manager.start([definition('one'), definition('two')]);
    expect(calls).toEqual([
      { pluginId: 'one', root: '/config', path: '/collector.js' },
      { pluginId: 'two', root: '/config', path: '/collector.js' },
    ]);
    children[0].exitCode = 0; children[0].emit('close', 0);
    await manager.close();
    expect(children[1].kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('무저장 라이브 source는 기동 수집 대상에서 제외한다', () => {
    const calls = [];
    const manager = new StartupCollectionManager('/config', console, '/collector.js', pluginId => { calls.push(pluginId); return child(); });
    manager.start([{ ...definition('live'), mode: 'live', persistence: 'none' }, definition('stored')]);
    expect(calls).toEqual(['stored']);
  });

  it('한 대상 실패를 기록하되 다른 대상을 종료하지 않는다', () => {
    const errors = []; const children = [];
    const manager = new StartupCollectionManager('/config', { error: value => errors.push(value) }, '/collector.js', () => { const value = child(); children.push(value); return value; });
    manager.start([definition('one'), definition('two')]);
    children[0].stderr.write('credential=secret\ncollection_failed\n');
    children[0].exitCode = 3; children[0].emit('close', 3);
    expect(errors).toEqual(['기동 수집 실패: one']);
    expect(children[1].kill).not.toHaveBeenCalled();
  });

  it('한 대상의 동기 spawn 실패 뒤에도 다음 대상을 시작한다', () => {
    const errors = []; const calls = [];
    const manager = new StartupCollectionManager('/config', { error: value => errors.push(value) }, '/collector.js', pluginId => {
      calls.push(pluginId);
      if (pluginId === 'one') throw new Error('secret');
      return child();
    });
    manager.start([definition('one'), definition('two')]);
    expect(calls).toEqual(['one', 'two']);
    expect(errors).toEqual(['기동 수집 프로세스를 시작하지 못했습니다: one']);
  });
});
