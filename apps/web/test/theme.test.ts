import { afterEach, expect, test, vi } from 'vitest';
import { readTheme, resolveTheme, saveTheme, observeTheme } from '../src/theme';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

afterEach(() => vi.unstubAllGlobals());
const script = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)![1];
for (const saved of [null, 'bad', 'system', 'light', 'dark']) for (const dark of [false, true]) {
  test(`초기화와 실행 시 결정 일치 ${saved}/${dark}`, () => {
    const localStorage = { getItem: () => saved };
    vi.stubGlobal('window', { localStorage });
    const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
    runInNewContext(script, { localStorage, matchMedia: () => ({ matches: dark }), document: { documentElement: root } });
    expect(root.dataset.theme).toBe(resolveTheme(readTheme(), dark));
    expect(root.style.colorScheme).toBe(root.dataset.theme);
  });
}
test('저장소 실패 및 시스템 조회 불가에도 라이트로 시작하고 저장 실패를 전파하지 않는다', () => {
  const localStorage = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } };
  vi.stubGlobal('window', { localStorage });
  const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
  vi.stubGlobal('document', { documentElement: root });
  expect(readTheme()).toBe('system');
  expect(() => saveTheme('dark')).not.toThrow();
  const cleanup = observeTheme('system');
  expect(root.dataset.theme).toBe('light');
  cleanup();
  runInNewContext(script, { localStorage, document: { documentElement: root } });
  expect(root.dataset.theme).toBe('light');
});
test('시스템 변경을 추적하고 명시적 선택은 유지하며 구독을 해제한다', () => {
  let listener: (() => void) | undefined;
  const media = { matches: false, addEventListener: vi.fn((_event, callback) => { listener = callback; }), removeEventListener: vi.fn() };
  const root = { dataset: {} as Record<string, string>, style: {} };
  vi.stubGlobal('window', { matchMedia: () => media });
  vi.stubGlobal('document', { documentElement: root });
  const cleanup = observeTheme('system');
  media.matches = true; listener!(); expect(root.dataset.theme).toBe('dark');
  cleanup(); expect(media.removeEventListener).toHaveBeenCalledWith('change', listener);
  const explicitCleanup = observeTheme('light');
  listener!(); expect(root.dataset.theme).toBe('light');
  explicitCleanup();
});
