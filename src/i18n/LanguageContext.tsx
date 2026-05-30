// src/i18n/LanguageContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { LANGS, LOCALE, MESSAGES } from './messages';
import type { Lang } from './messages';
import { setLocale } from '../lib/time';

const STORAGE_KEY = 'app.lang';

function detectInitialLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && LANGS.some(l => l.code === saved)) return saved as Lang;
  const browser = navigator.language.toLowerCase();
  if (browser.startsWith('zh')) return 'zh';
  if (browser.startsWith('es')) return 'es';
  if (browser.startsWith('en')) return 'en';
  return 'zh';
}

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<Ctx>({
  lang: 'zh',
  setLang: () => {},
  t: (p) => p,
});

function resolve(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  // Set the formatter locale DURING render, not in an effect. The provider
  // renders before its descendants, so this guarantees formatDate/formatWeekday
  // read the new locale on the same render that `lang` changes. Doing it in a
  // useEffect runs after commit (children already rendered with the stale
  // locale) and mutating the module global triggers no re-render — so weekday
  // labels stayed in the previous language until an unrelated re-render.
  // The assignment is idempotent and derived purely from state, so it's safe.
  setLocale(LOCALE[lang]);

  useEffect(() => {
    document.documentElement.lang = LOCALE[lang];
  }, [lang]);

  function setLang(l: Lang) {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  }

  function t(path: string, vars?: Record<string, string | number>): string {
    const raw = resolve(MESSAGES[lang], path);
    if (typeof raw !== 'string') return path; // fallback to key if missing
    return interpolate(raw, vars);
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}
