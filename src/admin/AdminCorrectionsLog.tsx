// src/admin/AdminCorrectionsLog.tsx
// History of decided punch_edit_requests rows — both employee submissions
// that an admin approved/rejected and direct admin corrections (auto-approved).
// Pending rows live on /admin/approvals; superseded rows surface here too so
// the trail of re-submitted requests stays visible.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatDateTime, madridDayRange, madridTodayKey } from '../lib/time';
import { useTranslation } from '../i18n/LanguageContext';
import type { PunchEditRequest, Employee } from '../lib/types';

interface Row extends PunchEditRequest {
  employee:  Pick<Employee, 'full_name'> | null;
  creator:   Pick<Employee, 'full_name'> | null;
  reviewer:  Pick<Employee, 'full_name'> | null;
  target:    { effective_time: string; kind: 'in' | 'out' } | null;
}

interface EmployeeOption { id: string; full_name: string }

type RangeFilter = 'last7' | 'last30' | 'day';

const PAGE_SIZES = [10, 50, 100] as const;
type PageSize = typeof PAGE_SIZES[number];

const STATUS_STYLE: Record<Row['status'], string> = {
  pending:    'bg-amber-100 text-amber-800',
  approved:   'bg-emerald-100 text-emerald-700',
  rejected:   'bg-rose-100 text-rose-700',
  superseded: 'bg-slate-100 text-slate-600',
};

export function AdminCorrectionsLog() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('last7');
  const [selectedDate, setSelectedDate] = useState<string>(madridTodayKey());
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('all');
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState(0);

  // Load employee list once for the filter dropdown.
  useEffect(() => {
    supabase.from('employees').select('id, full_name').eq('active', true).order('full_name')
      .then(({ data }) => setEmployees((data as EmployeeOption[]) ?? []));
  }, []);

  // Reset to page 0 whenever the filters or page size change.
  useEffect(() => { setPage(0); }, [rangeFilter, selectedDate, filterEmployeeId, pageSize]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('punch_edit_requests')
      .select(`
        *,
        employee:employees!punch_edit_requests_employee_id_fkey(full_name),
        creator:employees!punch_edit_requests_created_by_fkey(full_name),
        reviewer:employees!punch_edit_requests_reviewed_by_fkey(full_name),
        target:effective_punches!punch_edit_requests_target_effective_id_fkey(effective_time, kind)
      `, { count: 'exact' })
      .neq('status', 'pending');

    if (rangeFilter === 'day') {
      const { start, end } = madridDayRange(selectedDate);
      q = q.gte('created_at', start).lt('created_at', end);
    } else {
      const days = rangeFilter === 'last7' ? 7 : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      q = q.gte('created_at', since);
    }
    if (filterEmployeeId !== 'all') {
      q = q.eq('employee_id', filterEmployeeId);
    }

    const { data, count } = await q
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    setRows((data as unknown as Row[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, [rangeFilter, selectedDate, filterEmployeeId, page, pageSize]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  return (
    <div className="min-h-full max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Link to="/admin" className="inline-block text-sm text-emerald-700 hover:underline">{t('common.back')}</Link>
      <h1 className="text-2xl font-bold text-slate-900">{t('admin.corrections.title')}</h1>

      <div className="flex items-center gap-3 flex-wrap text-sm">
        <label className="flex items-center gap-2">
          <span className="text-slate-600">{t('admin.rangeLabel')}</span>
          <select
            value={rangeFilter}
            onChange={e => setRangeFilter(e.target.value as RangeFilter)}
            className="px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="last7">{t('admin.range.last7')}</option>
            <option value="last30">{t('admin.range.last30')}</option>
            <option value="day">{t('admin.range.day')}</option>
          </select>
        </label>
        {rangeFilter === 'day' && (
          <label className="flex items-center gap-2">
            <span className="text-slate-600">{t('admin.dateLabel')}</span>
            <input
              type="date"
              value={selectedDate}
              max={madridTodayKey()}
              onChange={e => {
                const v = e.target.value;
                if (v && v > madridTodayKey()) return;
                if (v) setSelectedDate(v);
              }}
              className="px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </label>
        )}
        <label className="flex items-center gap-2">
          <span className="text-slate-600">{t('admin.filterLabel')}</span>
          <select
            value={filterEmployeeId}
            onChange={e => setFilterEmployeeId(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="all">{t('admin.filterAll')}</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.full_name}</option>
            ))}
          </select>
        </label>
      </div>

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

          <div className="app-card px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-sm">
            <label className="flex items-center gap-2">
              <span className="text-slate-600">{t('common.pagination.perPage')}</span>
              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value) as PageSize)}
                className="px-2 py-1 rounded-md bg-white ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {PAGE_SIZES.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={safePage <= 0}
                className="px-3 py-1 rounded-md ring-1 ring-slate-300 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                {t('common.pagination.prev')}
              </button>
              <span className="text-xs text-slate-500 tabular-nums min-w-max">
                {t('common.pagination.pageOf', { page: safePage + 1, total: totalPages })}
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="px-3 py-1 rounded-md ring-1 ring-slate-300 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                {t('common.pagination.next')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
