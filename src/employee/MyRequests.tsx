// src/employee/MyRequests.tsx
// Employee's own list of edit requests across all statuses. Mirrors the admin
// approvals card layout but is read-only — no approve/reject buttons — and
// adds a status badge (Pendiente / Aprobada / Rechazada / Reemplazada).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { formatDateTime } from '../lib/time';
import { useTranslation } from '../i18n/LanguageContext';
import type { PunchEditRequest } from '../lib/types';

interface Row extends PunchEditRequest {
  target: { effective_time: string; kind: 'in' | 'out' } | null;
}

const STATUS_STYLE: Record<Row['status'], string> = {
  pending:    'bg-amber-100 text-amber-800',
  approved:   'bg-emerald-100 text-emerald-700',
  rejected:   'bg-rose-100 text-rose-700',
  superseded: 'bg-slate-100 text-slate-600',
};

export function MyRequests() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    supabase
      .from('punch_edit_requests')
      .select(`
        *,
        target:effective_punches!punch_edit_requests_target_effective_id_fkey(effective_time, kind)
      `)
      .eq('employee_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRows((data as unknown as Row[]) ?? []);
        setLoading(false);
      });
  }, [profile]);

  return (
    <div className="min-h-full max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Link to="/history" className="inline-block text-sm text-emerald-700 hover:underline">{t('common.back')}</Link>
      <h1 className="text-2xl font-bold text-slate-900">{t('myRequests.title')}</h1>

      {loading ? (
        <div className="app-card px-4 py-8 text-center text-slate-500 text-sm">{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="app-card px-4 py-8 text-center text-slate-500 text-sm">{t('myRequests.none')}</div>
      ) : (
        <ul className="space-y-3">
          {rows.map(r => (
            <li key={r.id} className="app-card p-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
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
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                  {t(`myRequests.status.${r.status}`)}
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

              <div className="text-xs text-slate-400 tabular-nums">
                {t('myRequests.submittedAt', { time: formatDateTime(r.created_at) })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
