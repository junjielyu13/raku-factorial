// src/components/LanguagePicker.tsx
import { LANGS } from '../i18n/messages';
import type { Lang } from '../i18n/messages';
import { useTranslation } from '../i18n/LanguageContext';

export function LanguagePicker({ className = '' }: { className?: string }) {
  const { lang, setLang } = useTranslation();
  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      className={`text-sm px-2 py-1 border rounded bg-white ${className}`}
      aria-label="Language"
    >
      {LANGS.map(l => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
