// src/employee/EmployeeHome.tsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { PunchButton } from '../components/PunchButton';
import { LanguagePicker } from '../components/LanguagePicker';
import { LogoutButton } from '../components/LogoutButton';
import { formatTime, formatDate, madridDayKeyOf, madridTodayKey } from '../lib/time';
import { pairShifts, msToHm } from '../lib/worked';
import type { ShiftPair } from '../lib/worked';
import { useTranslation } from '../i18n/LanguageContext';
import type { EffectivePunch } from '../lib/types';

function initials(name: string | undefined): string {
  if (!name) return '·';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}

const LOOKBACK_DAYS = 7;

export function EmployeeHome() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [rows, setRows] = useState<EffectivePunch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('effective_punches')
      .select('*')
      .eq('employee_id', profile.id)
      .is('superseded_at', null)
      .gte('effective_time', since)
      .order('effective_time', { ascending: true });
    setRows((data as EffectivePunch[]) ?? []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const todayKey = madridTodayKey();
  const todayPunches = useMemo(
    () => rows.filter(r => madridDayKeyOf(r.effective_time) === todayKey),
    [rows, todayKey],
  );
  const lastTodayPunch = todayPunches[todayPunches.length - 1];
  const isOn = lastTodayPunch?.kind === 'in';
  const nextKind: 'in' | 'out' = isOn ? 'out' : 'in';

  // Re-tick once a minute while clocked in so today's running total stays fresh.
  const [tickNow, setTickNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isOn) return;
    setTickNow(Date.now());
    const id = setInterval(() => setTickNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [isOn]);

  const shifts = useMemo(() => pairShifts(rows), [rows]);

  // Group shifts by Madrid day (already newest-first from pairShifts).
  const grouped = useMemo(() => {
    const m = new Map<string, ShiftPair<EffectivePunch>[]>();
    for (const s of shifts) {
      if (!m.has(s.date)) m.set(s.date, []);
      m.get(s.date)!.push(s);
    }
    return Array.from(m.entries());
  }, [shifts]);

  // Per-day totals. Open shifts on today's date count up to `tickNow`.
  const dayTotalsMs = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shifts) {
      let ms = 0;
      if (s.in && s.out) {
        ms = new Date(s.out.effective_time).getTime() - new Date(s.in.effective_time).getTime();
      } else if (s.isOpen && s.in && s.date === todayKey) {
        ms = Math.max(0, tickNow - new Date(s.in.effective_time).getTime());
      }
      m.set(s.date, (m.get(s.date) ?? 0) + ms);
    }
    return m;
  }, [shifts, todayKey, tickNow]);

  return (
    <div className="min-h-full max-w-md mx-auto px-4 py-6 space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-semibold uppercase shrink-0">
            {initials(profile?.full_name)}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-slate-500">{formatDate(new Date().toISOString())}</div>
            <div className="text-base font-semibold text-slate-900 truncate">{profile?.full_name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <LanguagePicker />
          <LogoutButton />
        </div>
      </header>

      <section className="app-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${isOn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
          <span className={`text-sm font-medium ${isOn ? 'text-emerald-700' : 'text-slate-500'}`}>
            {isOn ? t('home.statusOn', { time: formatTime(lastTodayPunch.effective_time) }) : t('home.statusOff')}
          </span>
        </div>
        <PunchButton kind={nextKind} onSuccess={load} />
      </section>

      <section className="space-y-3">
        {loading ? (
          <div className="app-card px-4 py-6 text-center text-slate-500 text-sm">{t('common.loading')}</div>
        ) : grouped.length === 0 ? (
          <div className="app-card px-4 py-6 text-center text-slate-500 text-sm">{t('home.noPunchYet')}</div>
        ) : (
          grouped.map(([date, dayShifts]) => {
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
                    return (
                      <li key={`${anchor.id}-${idx}`} className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {s.in ? (
                            <span className="inline-flex items-center px-3 py-1.5 rounded-md bg-white ring-1 ring-slate-200 font-mono tabular-nums text-slate-900 text-sm">
                              {formatTime(s.in.effective_time)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1.5 rounded-md bg-slate-50 ring-1 ring-slate-200 text-slate-400 text-sm">—</span>
                          )}
                          <span className="text-slate-400 px-1">–</span>
                          {s.out ? (
                            <span className="inline-flex items-center px-3 py-1.5 rounded-md bg-white ring-1 ring-slate-200 font-mono tabular-nums text-slate-900 text-sm">
                              {formatTime(s.out.effective_time)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 text-sm font-medium">
                              ⚠️ {t('admin.shifts.openShift')}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </section>

      <nav className="grid grid-cols-1 gap-2">
        <Link to="/history" className="app-card px-4 py-3 text-sm text-slate-700 text-center hover:bg-slate-50">
          {t('home.myHistory')}
        </Link>
        {profile?.role === 'admin' && (
          <Link to="/admin" className="app-card px-4 py-3 text-sm font-medium text-emerald-700 text-center hover:bg-emerald-50">
            {t('home.adminLink')} →
          </Link>
        )}
      </nav>
    </div>
  );
}
