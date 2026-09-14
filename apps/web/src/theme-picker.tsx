import { useEffect, useRef, useState } from 'react';
import { useTheme, type ThemePreference } from './theme';

const choices = [{ value: 'system', label: '시스템 설정' }, { value: 'light', label: '라이트' }, { value: 'dark', label: '다크' }] as const;

export function ThemeIcon({ theme }: { theme: 'light' | 'dark' }) {
  return <svg data-theme-icon={theme} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {theme === 'light' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></> : <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />}
  </svg>;
}

export function ThemePicker() {
  const [preference, selectTheme, resolved] = useTheme();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const choose = (value: ThemePreference) => { selectTheme(value); setOpen(false); trigger.current?.focus(); };
  const label = choices.find(choice => choice.value === preference)!.label;
  return <div className="theme-control" ref={container} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} className="theme-trigger" type="button" aria-label={`화면 테마: ${label}`} title={`화면 테마: ${label}`} aria-expanded={open} aria-controls="theme-options" onClick={() => setOpen(value => !value)}><ThemeIcon theme={resolved} /></button>
    {open ? <div id="theme-options" className="theme-options" role="group" aria-label="화면 테마 선택">
      {choices.map(choice => <button key={choice.value} type="button" aria-pressed={preference === choice.value} onClick={() => choose(choice.value)}>
        {choice.value === 'system' ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></svg> : <ThemeIcon theme={choice.value} />}
        <span>{choice.label}</span><span className="theme-check" aria-hidden="true">{preference === choice.value ? '✓' : ''}</span>
      </button>)}
    </div> : null}
  </div>;
}
