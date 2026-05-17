import { LANGS } from '../i18n/messages';
import type { Lang } from '../i18n/messages';
import { useTranslation } from '../i18n/LanguageContext';

export function LanguagePicker({ className = '' }: { className?: string }) {
  const { lang, setLang } = useTranslation();
  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      className={`text-sm pl-3 pr-7 py-2 rounded-lg bg-white ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 appearance-none bg-[length:14px] bg-no-repeat bg-[right_0.5rem_center] bg-[url('data:image/svg+xml;utf8,<svg fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22 viewBox=%220 0 24 24%22 xmlns=%22http://www.w3.org/2000/svg%22><path d=%22M6 9l6 6 6-6%22/></svg>')] ${className}`}
      aria-label="Language"
    >
      {LANGS.map(l => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
