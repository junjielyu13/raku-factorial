// src/admin/AdminExport.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { exportMonthCsv } from '../lib/api';
import type { ApiError } from '../lib/api';
import { currentMonthKey } from '../lib/time';
import { useTranslation } from '../i18n/LanguageContext';

export function AdminExport() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(currentMonthKey());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true); setErr(null);
    try {
      const csv = await exportMonthCsv(month);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `punches-${month}.csv`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setErr(t('admin.export.failed', { code: (e as ApiError).code }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <Link to="/admin" className="text-blue-700 underline text-sm">{t('common.back')}</Link>
      <h1 className="text-xl font-semibold">{t('admin.export.title')}</h1>
      <label className="block">
        <span className="text-sm">{t('admin.export.monthLabel')}</span>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="w-full px-3 py-2 border rounded" />
      </label>
      <button onClick={go} disabled={busy}
        className="w-full py-2 bg-blue-600 text-white rounded disabled:opacity-50">
        {busy ? t('admin.export.generating') : t('admin.export.download')}
      </button>
      {err && <div className="text-red-700">{err}</div>}
    </div>
  );
}
