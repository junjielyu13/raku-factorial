// src/components/BackfillWeekModal.tsx
// Preview + confirm for the admin "backfill week" action. Lists every punch that
// will be added for one employee, then writes them all in one atomic call.
import { useState } from 'react';
import { backfillWeek } from '../lib/api';
import type { ApiError } from '../lib/api';
import type { BackfillPunch } from '../lib/backfill';
import { useTranslation } from '../i18n/LanguageContext';
import { formatTime, formatDate, formatWeekday } from '../lib/time';

interface Props {
  employeeId: string;
  employeeName: string;
  punches: BackfillPunch[];
  onClose: () => void;
  onDone: () => void;
}

export function BackfillWeekModal({ employeeId, employeeName, punches, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState(t('admin.backfill.reasonDefault'));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Group the (already chronological) punches by day for a readable preview.
  const byDay: { dateKey: string; items: BackfillPunch[] }[] = [];
  for (const p of punches) {
    let bucket = byDay.find(b => b.dateKey === p.dateKey);
    if (!bucket) { bucket = { dateKey: p.dateKey, items: [] }; byDay.push(bucket); }
    bucket.items.push(p);
  }

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await backfillWeek({
        employee_id: employeeId,
        punches: punches.map(p => ({ kind: p.kind, time: p.timeIso })),
        reason: reason.trim(),
      });
      onDone();
    } catch (e: unknown) {
      const apiErr = e as ApiError;
      const known = t(`admin.correct.errors.${apiErr.code}`, { code: apiErr.code });
      setErr(known.startsWith('admin.correct.errors.')
        ? t('admin.correct.errors.UNKNOWN', { code: apiErr.code })
        : known);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <div className="app-card w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900">{t('admin.backfill.title')}</h2>
        <p className="text-sm text-slate-600">{t('admin.backfill.intro', { name: employeeName })}</p>

        <div className="max-h-64 overflow-y-auto rounded-lg bg-slate-50 px-3 py-2 space-y-2">
          {byDay.map(({ dateKey, items }) => {
            const dayIso = `${dateKey}T12:00:00Z`;
            return (
              <div key={dateKey} className="space-y-0.5">
                <div className="text-xs font-semibold text-slate-700">
                  {formatDate(dayIso)} <span className="font-normal text-slate-500">{formatWeekday(dayIso)}</span>
                </div>
                {items.map((p, i) => (
                  <div key={i} className="flex justify-between gap-3 text-sm text-slate-700 pl-2">
                    <span className="text-slate-500">
                      {t(`admin.backfill.${p.shift}`)} · {p.kind === 'in' ? t('punch.in') : t('punch.out')}
                    </span>
                    <span className="font-mono tabular-nums">{formatTime(p.timeIso)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('admin.correct.reasonLabel')}</span>
          <textarea required value={reason} onChange={e => setReason(e.target.value)} rows={2}
            className="app-input resize-none" />
        </label>

        {err && (
          <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{err}</div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-white ring-1 ring-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition">
            {t('admin.correct.cancel')}
          </button>
          <button type="button" onClick={submit} disabled={busy || punches.length === 0 || reason.trim().length === 0}
            className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-60 transition">
            {busy ? t('admin.backfill.submitting') : t('admin.backfill.confirm', { count: punches.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
