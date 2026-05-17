// src/employee/SubmitEditRequest.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { submitEditRequest } from '../lib/api';
import type { ApiError } from '../lib/api';
import { useTranslation } from '../i18n/LanguageContext';

export function SubmitEditRequest() {
  const nav = useNavigate();
  const { t } = useTranslation();
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
      nav('/', { replace: true });
    } catch (e: unknown) {
      const apiErr = e as ApiError;
      const known = t(`editRequest.errors.${apiErr.code}`, { code: apiErr.code });
      setErr(known.startsWith('editRequest.errors.') ? t('editRequest.errors.UNKNOWN', { code: apiErr.code }) : known);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <Link to="/" className="text-blue-700 underline text-sm">{t('common.back')}</Link>
      <h1 className="text-xl font-semibold">{t('editRequest.title')}</h1>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-sm">{t('editRequest.type')}</span>
          <select value={kind} onChange={e => setKind(e.target.value as 'in' | 'out')}
            className="w-full px-3 py-2 border rounded">
            <option value="in">{t('punch.in')}</option>
            <option value="out">{t('punch.out')}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm">{t('editRequest.actualTime')}</span>
          <input type="datetime-local" required value={datetime} onChange={e => setDatetime(e.target.value)}
            className="w-full px-3 py-2 border rounded" />
        </label>
        <label className="block">
          <span className="text-sm">{t('editRequest.reason')}</span>
          <textarea required value={reason} onChange={e => setReason(e.target.value)}
            rows={3} className="w-full px-3 py-2 border rounded" />
        </label>
        <button type="submit" disabled={busy}
          className="w-full py-2 bg-blue-600 text-white rounded disabled:opacity-50">
          {busy ? t('editRequest.submitting') : t('editRequest.submit')}
        </button>
        {err && <div className="text-red-700 text-sm">{err}</div>}
      </form>
    </div>
  );
}
