'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Storefront appearance chosen in Settings: Light / Dark / System and an accent colour. Saved per browser
 * (localStorage) and applied as data-theme / data-accent on <html>; globals.css maps those to colour tokens.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type Accent = 'blue' | 'violet' | 'emerald' | 'rose' | 'orange';

export const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: 'blue', label: 'Ocean blue', swatch: '#2563eb' },
  { value: 'violet', label: 'Royal violet', swatch: '#7c3aed' },
  { value: 'emerald', label: 'Emerald', swatch: '#047857' },
  { value: 'rose', label: 'Rose', swatch: '#e11d48' },
  { value: 'orange', label: 'Sunset orange', swatch: '#c2410c' },
];

const STORAGE_KEY = 'storefront-theme';
const MODES: ThemeMode[] = ['light', 'dark', 'system'];

interface Saved {
  mode: ThemeMode;
  accent: Accent;
}

const DEFAULTS: Saved = { mode: 'system', accent: 'blue' };

function readSaved(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Saved> | null;
    return {
      mode: raw?.mode && MODES.includes(raw.mode) ? raw.mode : DEFAULTS.mode,
      accent: raw?.accent && ACCENTS.some((a) => a.value === raw.accent) ? raw.accent : DEFAULTS.accent,
    };
  } catch {
    return DEFAULTS;
  }
}

const systemDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

function apply(mode: ThemeMode, accent: Accent, animate: boolean) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theme-transition');
    window.setTimeout(() => root.classList.remove('theme-transition'), 250);
  }
  const resolved = mode === 'system' ? (systemDark() ? 'dark' : 'light') : mode;
  root.dataset.theme = resolved;
  root.dataset.accent = accent;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#121823' : '#ffffff');
  return resolved;
}

/**
 * Inline in <head> so the saved theme is on <html> before the first paint (no light flash in dark mode).
 * Kept dependency-free and in sync with readSaved / apply above.
 */
export const themeBootScript = `(function(){try{var s=JSON.parse(localStorage.getItem('${STORAGE_KEY}')||'null')||{};var m=s.mode==='light'||s.mode==='dark'?s.mode:'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';r.dataset.accent=['blue','violet','emerald','rose','orange'].indexOf(s.accent)>=0?s.accent:'blue';}catch(e){}})();`;

interface ThemeValue {
  mode: ThemeMode;
  accent: Accent;
  /** What is actually showing: system mode resolved against the OS setting. */
  resolved: 'light' | 'dark';
  setMode: (m: ThemeMode) => void;
  setAccent: (a: Accent) => void;
  /** Header quick switch: flips between light and dark. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Saved>(DEFAULTS);
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  // Pick up what the boot script already applied.
  useEffect(() => {
    const s = readSaved();
    setSaved(s);
    setResolved(apply(s.mode, s.accent, false));
  }, []);

  // Follow the OS while in system mode.
  useEffect(() => {
    if (saved.mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(apply('system', saved.accent, true));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [saved]);

  const update = useCallback((next: Saved) => {
    setSaved(next);
    setResolved(apply(next.mode, next.accent, true));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode / blocked storage: the choice still applies for this visit.
    }
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      ...saved,
      resolved,
      setMode: (mode) => update({ ...saved, mode }),
      setAccent: (accent) => update({ ...saved, accent }),
      toggle: () => update({ ...saved, mode: resolved === 'dark' ? 'light' : 'dark' }),
    }),
    [saved, resolved, update],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
