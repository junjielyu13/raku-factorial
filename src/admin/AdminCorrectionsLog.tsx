// src/admin/AdminCorrectionsLog.tsx
// History of decided punch_edit_requests rows — both employee submissions
// that an admin approved/rejected and direct admin corrections (auto-approved).
// Pending rows live on /admin/approvals; superseded rows surface here too so
// the trail of re-submitted requests stays visible.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatDateTime } from '../lib/time';
import { useTranslation } from '../i18n/LanguageContext';
import type { PunchEditRequest, Employee } from '../lib/types';

interface Row extends PunchEditRequest {
  employee:  Pick<Employee, 'full_name'> | null;
  creator:   Pick<Employee, 'full_name'> | null;
  reviewer:  Pick<Employee, 'full_name'> | null;
  target:    { effective_time: string; kind: 'in' | 'out' } | null;
}

const STATUS_STYLE: Record<Row['status'], string> = {
  pending:    'bg-amber-100 text-amber-800',
  approved:   'bg-emerald-100 text-emerald-700',
  rejected:   'bg-rose-100 text-rose-700',
  superseded: 'bg-slate-100 text-slate-600',
};

const PAGE_SIZE = 50;

export function AdminCorrectionsLog() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('punch_edit_requests')
      .select(`
        *,
        employee:employees!punch_edit_requests_employee_id_fkey(full_name),
        creator:employees!punch_edit_requests_created_by_fkey(full_name),
        reviewer:employees!punch_edit_requests_reviewed_by_fkey(full_name),
        target:effective_punches!punch_edit_requests_target_effective_id_fkey(effective_time, kind)
      `)
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1)
      .then(({ data }) => {
        const all = (data as unknown as Row[]) ?? [];
        setHasMore(all.length > PAGE_SIZE);
        setRows(all.slice(0, PAGE_SIZE));
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-full max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Link to="/admin" className="inline-block text-sm text-emerald-700 hover:underline">{t('common.back')}</Link>
      <h1 className="text-2xl font-bold text-slate-900">{t('admin.corrections.title')}</h1>

      {loading ? (
        <div className="app-card px-4 py-8 text-center text-slate-500 text-sm">{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="app-card px-4 py-8 text-center text-slate-500 text-sm">{t('admin.corrections.none')}</div>
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map(r => {
              // Direct admin correction: the same person created and reviewed it,
              // and that person isn't the employee whose punch it touches.
              const isDirectAdmin = r.created_by != null
                && r.created_by === r.reviewed_by
                && r.created_by !== r.employee_id;
              return (
                <li key={r.id} className="app-card p-5 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">{r.employee?.full_name ?? '—'}</span>
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

                  <div className="text-xs text-slate-500 space-y-0.5 border-t border-slate-100 pt-2">
                    {isDirectAdmin ? (
                      <div>
                        {t('admin.corrections.byAdmin', {
                          admin: r.creator?.full_name ?? '—',
                          time: formatDateTime(r.created_at),
                        })}
                      </div>
                    ) : (
                      <>
                        <div>
                          {t('admin.corrections.submittedBy', {
                            name: r.creator?.full_name ?? r.employee?.full_name ?? '—',
                            time: formatDateTime(r.created_at),
                          })}
                        </div>
                        {r.reviewed_at && (
                          <div>
                            {t('admin.corrections.reviewedBy', {
                              name: r.reviewer?.full_name ?? '—',
                              time: formatDateTime(r.reviewed_at),
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <div className="text-center text-xs text-slate-500">
              {t('admin.corrections.truncated', { count: PAGE_SIZE })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
