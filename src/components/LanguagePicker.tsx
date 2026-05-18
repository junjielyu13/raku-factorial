import { LANGS } from '../i18n/messages';
import type { Lang } from '../i18n/messages';
import { useTranslation } from '../i18n/LanguageContext';

export function LanguagePicker({ className = '' }: { className?: string }) {
  const { lang, setLang } = useTranslation();
  return (
    <div className={`relative inline-block ${className}`}>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="text-sm pl-3 pr-8 py-2 rounded-lg bg-white ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 appearance-none cursor-pointer"
        aria-label="Language"
      >
        {LANGS.map(l => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}
