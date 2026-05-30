// src/employee/SubmitEditRequest.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { submitEditRequest } from '../lib/api';
import type { ApiError } from '../lib/api';
import { useTranslation } from '../i18n/LanguageContext';
import { MESSAGES } from '../i18n/messages';

export function SubmitEditRequest() {
  const nav = useNavigate();
  const { t, lang } = useTranslation();
  const commonReasons = MESSAGES[lang].editRequest.commonReasons;
  const [kind, setKind] = useState<'in' | 'out'>('in');
  const [datetime, setDatetime] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const iso = new Date(datetime).toISOString();
      await submitEditRequest({ requested_kind: kind, requested_time: iso, reason });
      nav('/history', { replace: true });
    } catch (e: unknown) {
      const apiErr = e as ApiError;
      const known = t(`editRequest.errors.${apiErr.code}`, { code: apiErr.code });
      setErr(known.startsWith('editRequest.errors.') ? t('editRequest.errors.UNKNOWN', { code: apiErr.code }) : known);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full max-w-md mx-auto px-4 py-6 space-y-4">
      <Link to="/history" className="inline-block text-sm text-emerald-700 hover:underline">{t('common.back')}</Link>
      <h1 className="text-2xl font-bold text-slate-900">{t('editRequest.title')}</h1>

      <form onSubmit={submit} className="app-card p-5 space-y-4">
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('editRequest.type')}</span>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            {(['in', 'out'] as const).map(k => (
              <button
                type="button"
                key={k}
                onClick={() => setKind(k)}
                className={`py-2 rounded-md text-sm font-medium transition ${kind === k ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}
              >
                {t(`punch.${k}`)}
              </button>
            ))}
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('editRequest.actualTime')}</span>
          <input type="datetime-local" required value={datetime} onChange={e => setDatetime(e.target.value)}
            className="app-input" />
        </label>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('editRequest.reason')}</span>
          <div className="flex flex-wrap gap-2">
            <span className="w-full text-xs text-slate-500">{t('editRequest.commonReasonsHint')}</span>
            {commonReasons.map(r => (
              <button
                type="button"
                key={r}
                onClick={() => setReason(r)}
                className={`rounded-full px-3 py-1 text-sm ring-1 transition ${
                  reason === r
                    ? 'bg-emerald-600 text-white ring-emerald-600'
                    : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea required value={reason} onChange={e => setReason(e.target.value)}
            rows={3} className="app-input resize-none" />
        </div>

        <button type="submit" disabled={busy} className="app-btn-primary">
          {busy ? t('editRequest.submitting') : t('editRequest.submit')}
        </button>
        {err && (
          <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
            {err}
          </div>
        )}
      </form>
    </div>
  );
}
