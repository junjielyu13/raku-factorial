// src/admin/AdminExport.tsx
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { exportData } from '../lib/api';
import type { ApiError } from '../lib/api';
import { downloadMonthlyPdf, type Period } from '../lib/monthlyPdf';
import { downloadExcel } from '../lib/excelExport';
import { currentMonthKey } from '../lib/time';
import { useTranslation } from '../i18n/LanguageContext';

type Scope = 'month' | 'year' | 'all';

const APP_START_YEAR = 2026;

export function AdminExport() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const initialMonth = (() => {
    const q = params.get('month');
    return q && /^\d{4}-\d{2}$/.test(q) ? q : currentMonthKey();
  })();
  const currentYear = Number(currentMonthKey().slice(0, 4));
  const years = Array.from({ length: Math.max(1, currentYear - APP_START_YEAR + 1) }, (_, i) => String(currentYear - i));

  const [scope, setScope] = useState<Scope>('month');
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(String(currentYear));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const period: Period =
    scope === 'all' ? { scope: 'all' }
    : scope === 'year' ? { scope: 'year', year }
    : { scope: 'month', month };

  async function goExcel() {
    setBusy(true); setErr(null);
    try {
      const data = await exportData(period);
      await downloadExcel(data.punches, period, {
        summarySheet: t('admin.export.excel.summarySheet'),
        detailSheet: t('admin.export.excel.detailSheet'),
        colEmployee: t('admin.export.excel.colEmployee'),
        colEmail: t('admin.export.excel.colEmail'),
        colTotalHours: t('admin.export.excel.colTotalHours'),
        colDate: t('admin.export.excel.colDate'),
        colWeekday: t('admin.export.excel.colWeekday'),
        colIn: t('admin.export.excel.colIn'),
        colOut: t('admin.export.excel.colOut'),
        colHours: t('admin.export.excel.colHours'),
      });
    } catch (e: unknown) {
      setErr(t('admin.export.failed', { code: (e as ApiError).code }));
    } finally {
      setBusy(false);
    }
  }

  async function goPdf() {
    setBusy(true); setErr(null);
    try {
      const data = await exportData(period);
      await downloadMonthlyPdf(data.punches, period);
    } catch (e: unknown) {
      setErr(t('admin.export.failed', { code: (e as ApiError).code }));
    } finally {
      setBusy(false);
    }
  }

  const scopes: { key: Scope; label: string }[] = [
    { key: 'month', label: t('admin.export.scopeMonth') },
    { key: 'year',  label: t('admin.export.scopeYear') },
    { key: 'all',   label: t('admin.export.scopeAll') },
  ];

  return (
    <div className="min-h-full max-w-md mx-auto px-4 py-6 space-y-4">
      <Link to="/admin" className="inline-block text-sm text-emerald-700 hover:underline">{t('common.back')}</Link>
      <h1 className="text-2xl font-bold text-slate-900">{t('admin.export.title')}</h1>

      <div className="app-card p-5 space-y-4">
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('admin.export.rangeLabel')}</span>
          <div className="flex rounded-lg ring-1 ring-slate-300 overflow-hidden">
            {scopes.map(s => (
              <button key={s.key} onClick={() => setScope(s.key)}
                className={`flex-1 py-2 text-sm font-medium transition ${
                  scope === s.key ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {scope === 'month' && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t('admin.export.monthLabel')}</span>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="app-input" />
          </label>
        )}
        {scope === 'year' && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t('admin.export.yearLabel')}</span>
            <select value={year} onChange={e => setYear(e.target.value)} className="app-input">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        )}

        <button onClick={goExcel} disabled={busy} className="app-btn-primary">
          {busy ? t('admin.export.generating') : t('admin.export.downloadExcel')}
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
