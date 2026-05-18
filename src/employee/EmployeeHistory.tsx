// src/employee/EmployeeHistory.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { formatDate, formatTime, madridDayRange, madridDayKeyOf, madridTodayKey } from '../lib/time';
import { workedMsForDay, msToHm } from '../lib/worked';
import { useTranslation } from '../i18n/LanguageContext';
import type { EffectivePunch } from '../lib/types';

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

  useEffect(() => {
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

    q.order('effective_time', { ascending: false })
      .then(({ data }) => { setRows((data as EffectivePunch[]) ?? []); setLoading(false); });
  }, [profile, filter, selectedDate]);

  // Reset to first page when filter, date, or page size changes.
  useEffect(() => { setPage(0); }, [filter, selectedDate, pageSize]);

  const todayKey = madridTodayKey();

  // Per-day totals computed from the FULL set so they don't change as you paginate.
  const dayTotalsMs = useMemo(() => {
    const byDay = new Map<string, EffectivePunch[]>();
    for (const r of rows) {
      const k = madridDayKeyOf(r.effective_time);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push(r);
    }
    const out = new Map<string, number>();
    for (const [k, items] of byDay) {
      out.set(k, workedMsForDay(items, k === todayKey ? Date.now() : null));
    }
    return out;
  }, [rows, todayKey]);

  const rangeTotal = msToHm(Array.from(dayTotalsMs.values()).reduce((a, b) => a + b, 0));

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pagedRows = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // Group the paginated slice for rendering (day totals come from dayTotalsMs).
  const groups = useMemo(() => {
    const m = new Map<string, EffectivePunch[]>();
    for (const r of pagedRows) {
      const k = madridDayKeyOf(r.effective_time);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries());
  }, [pagedRows]);

  return (
    <div className="min-h-full max-w-md mx-auto px-4 py-6 space-y-4">
      <Link to="/" className="inline-block text-sm text-emerald-700 hover:underline">{t('common.back')}</Link>
      <h1 className="text-2xl font-bold text-slate-900">{t('history.title')}</h1>

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
      ) : rows.length === 0 ? (
        <div className="app-card px-4 py-6 text-center text-slate-500 text-sm">{t('history.noRecords')}</div>
      ) : (
        <div className="space-y-4">
          {filter !== 'day' && (
            <div className="app-card px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-slate-600">{t(`history.filter.${filter}`)}</span>
              <span className="text-sm font-semibold text-slate-900 tabular-nums">
                {t('history.rangeTotal', { h: rangeTotal.h, m: rangeTotal.m })}
              </span>
            </div>
          )}
          {groups.map(([dayKey, items]) => {
            const dayTotal = msToHm(dayTotalsMs.get(dayKey) ?? 0);
            return (
              <section key={dayKey} className="space-y-2">
                <div className="px-1 flex items-baseline justify-between gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {formatDate(items[0].effective_time)}
                  </h2>
                  <span className="text-xs font-medium text-slate-600 tabular-nums">
                    {t('history.total', { h: dayTotal.h, m: dayTotal.m })}
                  </span>
                </div>
                <ul className="app-card divide-y divide-slate-100 overflow-hidden">
                  {items.map(r => (
                    <li key={r.id} className="px-4 py-3 flex items-center gap-3">
                      <span className={`inline-flex items-center justify-center h-8 w-8 rounded-full text-xs font-semibold ${r.kind === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.kind === 'in' ? '▶' : '■'}
                      </span>
                      <span className="text-slate-700 flex-1">{r.kind === 'in' ? t('punch.in') : t('punch.out')}</span>
                      <span className="font-mono tabular-nums text-slate-900">{formatTime(r.effective_time)}</span>
                    </li>
                  ))}
                </ul>
              </section>
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
    </div>
  );
}
