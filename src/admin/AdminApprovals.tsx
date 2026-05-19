// src/admin/AdminApprovals.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { approveEdit, rejectEdit } from '../lib/api';
import type { ApiError } from '../lib/api';
import { formatDateTime } from '../lib/time';
import { useTranslation } from '../i18n/LanguageContext';
import type { PunchEditRequest, Employee } from '../lib/types';

interface Row extends PunchEditRequest {
  employee: Pick<Employee, 'full_name' | 'email'>;
  // Joined via target_effective_id; null when action='add' (no target yet).
  target: { effective_time: string; kind: 'in' | 'out' } | null;
}

export function AdminApprovals() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from('punch_edit_requests')
      .select(`
        *,
        employee:employees!punch_edit_requests_employee_id_fkey(full_name, email),
        target:effective_punches!punch_edit_requests_target_effective_id_fkey(effective_time, kind)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    setRows((data as unknown as Row[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  async function decide(id: string, kind: 'approve' | 'reject') {
    setBusy(id); setErr(null);
    try {
      if (kind === 'approve') await approveEdit(id, '');
      else await rejectEdit(id, '');
      await load();
    } catch (e: unknown) {
      const apiErr = e as ApiError;
      setErr(t(kind === 'approve' ? 'admin.approvals.approveFailed' : 'admin.approvals.rejectFailed', { code: apiErr.code }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-full max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Link to="/admin" className="inline-block text-sm text-emerald-700 hover:underline">{t('common.back')}</Link>
      <h1 className="text-2xl font-bold text-slate-900">{t('admin.approvals.title')}</h1>

      {err && (
        <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
          {err}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="app-card px-4 py-8 text-center text-slate-500 text-sm">{t('admin.approvals.none')}</div>
      ) : (
        <ul className="space-y-3">
          {rows.map(r => (
            <li key={r.id} className="app-card p-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-900">{r.employee.full_name}</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.action === 'add' ? 'bg-emerald-100 text-emerald-700'
                    : r.action === 'modify' ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {t(`admin.approvals.action.${r.action}`)}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                  {r.requested_kind === 'in' ? t('punch.in') : t('punch.out')}
                </span>
              </div>

              {r.action === 'modify' ? (
                <div className="text-sm text-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div>
                    <span className="text-slate-500">{t('admin.approvals.originalLabel')}</span>{' '}
                    <span className="font-mono tabular-nums">
                      {r.target ? formatDateTime(r.target.effective_time) : '—'}
                    </span>
                  </div>
                  <span className="text-slate-400">→</span>
                  <div>
                    <span className="text-slate-500">{t('admin.approvals.requestedLabel')}</span>{' '}
                    <span className="font-mono tabular-nums">{formatDateTime(r.requested_time)}</span>
                  </div>
                </div>
              ) : r.action === 'delete' ? (
                <div className="text-sm text-slate-700">
                  <span className="text-slate-500">{t('admin.approvals.targetLabel')}</span>{' '}
                  <span className="font-mono tabular-nums">
                    {r.target ? formatDateTime(r.target.effective_time) : formatDateTime(r.requested_time)}
                  </span>
                </div>
              ) : (
                <div className="text-sm text-slate-700">
                  <span className="text-slate-500">{t('admin.approvals.requestedLabel')}</span>{' '}
                  <span className="font-mono tabular-nums">{formatDateTime(r.requested_time)}</span>
                </div>
              )}

              <div className="text-sm text-slate-700">
                <span className="text-slate-500">{t('admin.approvals.reasonLabel')}</span> {r.reason}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => decide(r.id, 'approve')} disabled={busy === r.id}
                  className="flex-1 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60 transition"
                >
                  {t('admin.approvals.approve')}
                </button>
                <button
                  onClick={() => decide(r.id, 'reject')} disabled={busy === r.id}
                  className="flex-1 py-2 rounded-lg bg-white ring-1 ring-rose-300 text-rose-700 font-medium hover:bg-rose-50 disabled:opacity-60 transition"
                >
                  {t('admin.approvals.reject')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
