// src/employee/EmployeeHome.tsx
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { PunchButton } from '../components/PunchButton';
import { LanguagePicker } from '../components/LanguagePicker';
import { LogoutButton } from '../components/LogoutButton';
import { formatTime, formatDate, madridTodayRange } from '../lib/time';
import { useTranslation } from '../i18n/LanguageContext';
import type { EffectivePunch } from '../lib/types';

function initials(name: string | undefined): string {
  if (!name) return '·';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}

export function EmployeeHome() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [today, setToday] = useState<EffectivePunch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { start, end } = madridTodayRange();
    const { data } = await supabase
      .from('effective_punches')
      .select('*')
      .eq('employee_id', profile.id)
      .is('superseded_at', null)
      .gte('effective_time', start)
      .lt('effective_time', end)
      .order('effective_time', { ascending: true });
    setToday((data as EffectivePunch[]) ?? []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const lastPunch = today[today.length - 1];
  const isOn = lastPunch?.kind === 'in';
  const nextKind: 'in' | 'out' = isOn ? 'out' : 'in';

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
            {isOn ? t('home.statusOn', { time: formatTime(lastPunch.effective_time) }) : t('home.statusOff')}
          </span>
        </div>
        <PunchButton kind={nextKind} onSuccess={load} />
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{t('home.todayLabel')}</h2>
        <div className="app-card overflow-hidden">
          {loading ? (
            <div className="px-4 py-6 text-center text-slate-500 text-sm">{t('common.loading')}</div>
          ) : today.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-500 text-sm">{t('home.noPunchYet')}</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {today.slice(-6).map(p => (
                <li key={p.id} className="px-4 py-3 flex items-center gap-3">
                  <span className={`inline-flex items-center justify-center h-8 w-8 rounded-full text-xs font-semibold ${p.kind === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {p.kind === 'in' ? '▶' : '■'}
                  </span>
                  <span className="text-slate-700 flex-1">{p.kind === 'in' ? t('punch.in') : t('punch.out')}</span>
                  <span className="font-mono tabular-nums text-slate-900">{formatTime(p.effective_time)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <nav className="grid grid-cols-2 gap-2">
        <Link to="/history" className="app-card px-4 py-3 text-sm text-slate-700 text-center hover:bg-slate-50">
          {t('home.myHistory')}
        </Link>
        <Link to="/submit-edit" className="app-card px-4 py-3 text-sm text-slate-700 text-center hover:bg-slate-50">
          {t('home.submitEdit')}
        </Link>
        {profile?.role === 'admin' && (
          <Link to="/admin" className="col-span-2 app-card px-4 py-3 text-sm font-medium text-emerald-700 text-center hover:bg-emerald-50">
            {t('home.adminLink')} →
          </Link>
        )}
      </nav>
    </div>
  );
}
