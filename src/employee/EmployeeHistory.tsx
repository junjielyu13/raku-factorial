// src/employee/EmployeeHistory.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { formatDate, formatTime, madridDayRange, madridTodayKey } from '../lib/time';
import { useTranslation } from '../i18n/LanguageContext';
import type { EffectivePunch } from '../lib/types';

type Filter = 'last7' | 'last30' | 'day';

export function EmployeeHistory() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [rows, setRows] = useState<EffectivePunch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('last30');
  const [selectedDate, setSelectedDate] = useState<string>(madridTodayKey());

  useEffect(() => {
    if (!profile) return;
    setLoading(true);

    let q = supabase.from('effective_punches').select('*').eq('employee_id', profile.id);

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

  const groups = useMemo(() => {
    const m = new Map<string, EffectivePunch[]>();
    for (const r of rows) {
      const key = formatDate(r.effective_time);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return Array.from(m.entries());
  }, [rows]);

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
          {groups.map(([date, items]) => (
            <section key={date} className="space-y-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{date}</h2>
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
          ))}
        </div>
      )}
    </div>
  );
}
