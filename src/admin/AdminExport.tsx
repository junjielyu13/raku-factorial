// src/admin/AdminExport.tsx
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { exportData, fetchCompany, fetchDniByEmail } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { ApiError } from '../lib/api';
import { downloadMonthlyPdf, type Period, type PunchRow } from '../lib/monthlyPdf';
import { downloadExcel } from '../lib/excelExport';
import { fileSlug, splitByEmployee, withoutRoles } from '../lib/exportBatch';
import type { Employee } from '../lib/types';
import { currentMonthKey } from '../lib/time';
import { useTranslation } from '../i18n/LanguageContext';

type Scope = 'month' | 'year' | 'all';
type FileMode = 'combined' | 'perEmployee';
type StaffOption = Pick<Employee, 'id' | 'full_name' | 'role'>;

// Pause between per-employee downloads so the browser doesn't drop any.
const BETWEEN_DOWNLOADS_MS = 600;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Thrown when the chosen range/employee has no punches (nothing to export).
const NO_DATA = 'NO_DATA';

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
  // 'all' or one employee id; IT accounts don't punch and are never exported.
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [target, setTarget] = useState<string>('all');
  const [fileMode, setFileMode] = useState<FileMode>('combined');

  useEffect(() => {
    supabase.from('employees').select('id, full_name, role').order('full_name')
      .then(({ data }) => setStaff((data as StaffOption[]) ?? []));
  }, []);
  const exportable = staff.filter(e => e.role !== 'it');

  const period: Period =
    scope === 'all' ? { scope: 'all' }
    : scope === 'year' ? { scope: 'year', year }
    : { scope: 'month', month };

  // The files to produce: one combined file, or one per employee (suffix = name).
  function batchesOf(punches: PunchRow[]): { punches: PunchRow[]; suffix?: string }[] {
    const rows = withoutRoles(punches, staff, ['it']);
    if (target !== 'all') {
      const mine = rows.filter(r => r.employee_id === target);
      const name = exportable.find(e => e.id === target)?.full_name ?? '';
      return mine.length ? [{ punches: mine, suffix: fileSlug(name) }] : [];
    }
    if (fileMode === 'perEmployee') {
      return splitByEmployee(rows).map(b => ({ punches: b.punches, suffix: fileSlug(b.name) }));
    }
    return rows.length ? [{ punches: rows }] : [];
  }

  async function run(produce: (batch: { punches: PunchRow[]; suffix?: string }) => Promise<void>, punches: PunchRow[]) {
    const batches = batchesOf(punches);
    if (batches.length === 0) throw { code: NO_DATA };
    for (const [i, b] of batches.entries()) {
      if (i > 0) await sleep(BETWEEN_DOWNLOADS_MS);
      await produce(b);
    }
  }

  function fail(e: unknown) {
    const code = (e as ApiError).code;
    setErr(code === NO_DATA ? t('admin.export.noData') : t('admin.export.failed', { code }));
  }

  async function goExcel() {
    setBusy(true); setErr(null);
    try {
      const data = await exportData(period);
      const labels = {
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
      };
      await run(b => downloadExcel(b.punches, period, labels, b.suffix), data.punches);
    } catch (e: unknown) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function goPdf() {
    setBusy(true); setErr(null);
    try {
      const [data, dni, company] = await Promise.all([exportData(period), fetchDniByEmail(), fetchCompany()]);
      await run(b => downloadMonthlyPdf(b.punches, period, dni, company, b.suffix), data.punches);
    } catch (e: unknown) {
      fail(e);
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

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('admin.export.employeeLabel')}</span>
          <select value={target} onChange={e => setTarget(e.target.value)} className="app-input">
            <option value="all">{t('admin.export.allEmployees')}</option>
            {exportable.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </label>

        {target === 'all' && (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t('admin.export.fileModeLabel')}</span>
            <div className="flex rounded-lg ring-1 ring-slate-300 overflow-hidden">
              {([['combined', t('admin.export.fileCombined')], ['perEmployee', t('admin.export.filePerEmployee')]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setFileMode(key)}
                  className={`flex-1 py-2 text-sm font-medium transition ${
                    fileMode === key ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            {fileMode === 'perEmployee' && (
              <p className="text-xs text-slate-500">{t('admin.export.perEmployeeHint')}</p>
            )}
          </div>
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
