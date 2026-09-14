import { useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export const themeStorageKey = 'oss-scp.theme';
export function readTheme(): ThemePreference {
  try {
    const value = window.localStorage.getItem(themeStorageKey);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch { return 'system'; }
}
export function resolveTheme(preference: ThemePreference, dark: boolean): 'light' | 'dark' {
  return preference === 'system' ? (dark ? 'dark' : 'light') : preference;
}
export function applyTheme(preference: ThemePreference, dark: boolean) {
  const theme = resolveTheme(preference, dark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
export function saveTheme(preference: ThemePreference) {
  try { window.localStorage.setItem(themeStorageKey, preference); } catch { /* Current session remains usable when storage is unavailable. */ }
}
export function observeTheme(preference: ThemePreference) {
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined;
  const update = () => applyTheme(preference, media?.matches ?? false);
  update();
  media?.addEventListener('change', update);
  return () => media?.removeEventListener('change', update);
}
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readTheme);
  useEffect(() => observeTheme(preference), [preference]);
  const selectTheme = (value: ThemePreference) => {
    applyTheme(value, typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setPreference(value);
    saveTheme(value);
  };
  return [preference, selectTheme] as const;
}
