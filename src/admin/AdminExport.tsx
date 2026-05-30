// src/admin/AdminExport.tsx
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { exportMonthCsv, exportMonthData } from '../lib/api';
import type { ApiError } from '../lib/api';
import { downloadMonthlyPdf } from '../lib/monthlyPdf';
import { currentMonthKey } from '../lib/time';
import { useTranslation } from '../i18n/LanguageContext';

export function AdminExport() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const initialMonth = (() => {
    const q = params.get('month');
    return q && /^\d{4}-\d{2}$/.test(q) ? q : currentMonthKey();
  })();
  const [month, setMonth] = useState(initialMonth);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true); setErr(null);
    try {
      const csv = await exportMonthCsv(month);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `raku-sant-cugat-punches-${month}.csv`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setErr(t('admin.export.failed', { code: (e as ApiError).code }));
    } finally {
      setBusy(false);
    }
  }

  async function goPdf() {
    setBusy(true); setErr(null);
    try {
      const data = await exportMonthData(month);
      await downloadMonthlyPdf(data.punches, month);
    } catch (e: unknown) {
      setErr(t('admin.export.failed', { code: (e as ApiError).code }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full max-w-md mx-auto px-4 py-6 space-y-4">
      <Link to="/admin" className="inline-block text-sm text-emerald-700 hover:underline">{t('common.back')}</Link>
      <h1 className="text-2xl font-bold text-slate-900">{t('admin.export.title')}</h1>

      <div className="app-card p-5 space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('admin.export.monthLabel')}</span>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="app-input" />
        </label>
        <button onClick={go} disabled={busy} className="app-btn-primary">
          {busy ? t('admin.export.generating') : t('admin.export.download')}
        </button>
        <button onClick={goPdf} disabled={busy} className="app-btn-secondary">
          {busy ? t('admin.export.generating') : t('admin.export.downloadPdf')}
        </button>
        {err && (
          <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
