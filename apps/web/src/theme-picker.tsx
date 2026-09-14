import { useTheme } from './theme';

export function ThemeIcon({ theme }: { theme: 'light' | 'dark' }) {
  return <svg data-theme-icon={theme} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {theme === 'light' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></> : <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />}
  </svg>;
}

export function ThemePicker() {
  const [, selectTheme, resolved] = useTheme();
  const next = resolved === 'light' ? 'dark' : 'light';
  const label = next === 'dark' ? '다크 모드로 전환' : '라이트 모드로 전환';
  return <button className="theme-trigger" type="button" aria-label={label} title={label} onClick={() => selectTheme(next)}><ThemeIcon theme={resolved} /></button>;
}
