// src/employee/EmployeeHistory.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { formatDate, formatTime, madridDayRange, madridTodayKey } from '../lib/time';
import { pairShifts, msToHm } from '../lib/worked';
import type { ShiftPair } from '../lib/worked';
import { useTranslation } from '../i18n/LanguageContext';
import type { EffectivePunch } from '../lib/types';
import { EditRequestModal } from '../components/EditRequestModal';
import type { EditTarget } from '../components/EditRequestModal';

type Filter = 'last7' | 'last30' | 'day';

const PAGE_SIZES = [10, 50, 100] as const;
type PageSize = typeof PAGE_SIZES[number];

export function EmployeeHistory() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [rows, setRows] = useState<EffectivePunch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('last30');
  const [selectedDate, setSelectedDate] = useState<string>(madridTodayKey());
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState(0);
  type ModalState =
    | { mode: 'modify'; target: EditTarget }
    | { mode: 'delete'; targets: EditTarget[] };
  const [modal, setModal] = useState<ModalState | null>(null);

  const load = useCallback(() => {
    if (!profile) return;
    setLoading(true);

    let q = supabase.from('effective_punches').select('*')
      .eq('employee_id', profile.id)
      .is('superseded_at', null);

    if (filter === 'day') {
      const { start, end } = madridDayRange(selectedDate);
      q = q.gte('effective_time', start).lt('effective_time', end);
    } else {
      const days = filter === 'last7' ? 7 : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      q = q.gte('effective_time', since);
    }

    q.order('effective_time', { ascending: true })
      .then(({ data }) => { setRows((data as EffectivePunch[]) ?? []); setLoading(false); });
  }, [profile, filter, selectedDate]);

  useEffect(() => { load(); }, [load]);

  // Reset to first page when filter, date, or page size changes.
  useEffect(() => { setPage(0); }, [filter, selectedDate, pageSize]);

  const todayKey = madridTodayKey();
  const shifts = useMemo(() => pairShifts(rows), [rows]);

  // Per-day totals from the FULL shift set so they don't change as you paginate.
  const dayTotalsMs = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shifts) {
      let ms = 0;
      if (s.in && s.out) {
        ms = new Date(s.out.effective_time).getTime() - new Date(s.in.effective_time).getTime();
      } else if (s.isOpen && s.in && s.date === todayKey) {
        ms = Math.max(0, Date.now() - new Date(s.in.effective_time).getTime());
      }
      m.set(s.date, (m.get(s.date) ?? 0) + ms);
    }
    return m;
  }, [shifts, todayKey]);

  const rangeTotal = msToHm(Array.from(dayTotalsMs.values()).reduce((a, b) => a + b, 0));

  const totalPages = Math.max(1, Math.ceil(shifts.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pagedShifts = shifts.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // Group paginated shifts by day for rendering (day totals stay from full set).
  const grouped = useMemo(() => {
    const m = new Map<string, ShiftPair<EffectivePunch>[]>();
    for (const s of pagedShifts) {
      if (!m.has(s.date)) m.set(s.date, []);
      m.get(s.date)!.push(s);
    }
    return Array.from(m.entries());
  }, [pagedShifts]);

  return (
    <div className="min-h-full max-w-md mx-auto px-4 py-6 space-y-4">
      <Link to="/" className="inline-block text-sm text-emerald-700 hover:underline">{t('common.back')}</Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{t('history.title')}</h1>
        <Link to="/submit-edit" className="app-btn-ghost shrink-0">
          {t('home.submitEdit')}
        </Link>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-100 p-1">
          {(['last7', 'last30', 'day'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`py-2 rounded-md text-sm font-medium transition ${filter === f ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}
            >
              {t(`history.filter.${f}`)}
            </button>
          ))}
        </div>
        {filter === 'day' && (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t('history.pickDate')}</span>
            <input
              type="date"
              value={selectedDate}
              max={madridTodayKey()}
              onChange={e => {
                const v = e.target.value;
                if (v && v > madridTodayKey()) return;
                setSelectedDate(v);
              }}
              className="app-input"
            />
          </label>
        )}
      </div>

      {loading ? (
        <div className="app-card px-4 py-6 text-center text-slate-500 text-sm">{t('common.loading')}</div>
      ) : shifts.length === 0 ? (
        <div className="app-card px-4 py-6 text-center text-slate-500 text-sm">{t('history.noRecords')}</div>
      ) : (
        <div className="space-y-3">
          {filter !== 'day' && (
            <div className="app-card px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-slate-600">{t(`history.filter.${filter}`)}</span>
              <span className="text-sm font-semibold text-slate-900 tabular-nums">
                {t('history.rangeTotal', { h: rangeTotal.h, m: rangeTotal.m })}
              </span>
            </div>
          )}
          {grouped.map(([date, dayShifts]) => {
            const dayHm = msToHm(dayTotalsMs.get(date) ?? 0);
            const dayAnchor = dayShifts[0].in ?? dayShifts[0].out!;
            return (
              <div key={date} className="app-card overflow-hidden">
                <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/60">
                  <div className="text-sm font-semibold text-slate-900">{formatDate(dayAnchor.effective_time)}</div>
                  <div className="flex items-center gap-1.5 text-sm text-slate-700">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-slate-500" aria-hidden="true">
                      <circle cx="12" cy="13" r="8" />
                      <path d="M12 9v4l2 2" />
                      <path d="M9 2h6" />
                    </svg>
                    <span className="font-mono tabular-nums">{t('admin.stats.hours', { h: dayHm.h, m: dayHm.m })}</span>
                  </div>
                </header>
                <ul className="divide-y divide-slate-100">
                  {dayShifts.map((s, idx) => {
                    const anchor = s.in ?? s.out!;
                    const rowTargets: EditTarget[] = [
                      ...(s.in ? [{ effective_id: s.in.id, kind: s.in.kind, effective_time: s.in.effective_time }] : []),
                      ...(s.out ? [{ effective_id: s.out.id, kind: s.out.kind, effective_time: s.out.effective_time }] : []),
                    ];
                    return (
                      <li key={`${anchor.id}-${idx}`} className="px-4 py-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {s.in ? (
                            <button
                              type="button"
                              onClick={() => setModal({ mode: 'modify', target: { effective_id: s.in!.id, kind: s.in!.kind, effective_time: s.in!.effective_time } })}
                              className="inline-flex items-center px-3 py-1.5 rounded-md bg-white ring-1 ring-slate-200 font-mono tabular-nums text-slate-900 text-sm hover:bg-slate-50 hover:ring-emerald-400 transition"
                              title={t('editRequest.requestModifyTitle')}
                            >
                              {formatTime(s.in.effective_time)}
                            </button>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1.5 rounded-md bg-slate-50 ring-1 ring-slate-200 text-slate-400 text-sm">—</span>
                          )}
                          <span className="text-slate-400 px-1">–</span>
                          {s.out ? (
                            <button
                              type="button"
                              onClick={() => setModal({ mode: 'modify', target: { effective_id: s.out!.id, kind: s.out!.kind, effective_time: s.out!.effective_time } })}
                              className="inline-flex items-center px-3 py-1.5 rounded-md bg-white ring-1 ring-slate-200 font-mono tabular-nums text-slate-900 text-sm hover:bg-slate-50 hover:ring-emerald-400 transition"
                              title={t('editRequest.requestModifyTitle')}
                            >
                              {formatTime(s.out.effective_time)}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 text-sm font-medium">
                              ⚠️ {t('admin.shifts.openShift')}
                            </span>
                          )}
                        </div>
                        {rowTargets.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setModal({ mode: 'delete', targets: rowTargets })}
                            className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title={t('editRequest.requestDeleteTitle')}
                            aria-label={t('editRequest.requestDeleteTitle')}
                          >
                            ✕
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

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
        </div>
      )}

      {modal && (modal.mode === 'modify' ? (
        <EditRequestModal
          mode="modify"
          target={modal.target}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load(); }}
        />
      ) : (
        <EditRequestModal
          mode="delete"
          targets={modal.targets}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load(); }}
        />
      ))}
    </div>
  );
}
