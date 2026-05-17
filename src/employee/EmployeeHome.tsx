// src/employee/EmployeeHome.tsx
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { PunchButton } from '../components/PunchButton';
import { LanguagePicker } from '../components/LanguagePicker';
import { formatTime, formatDate, madridTodayRange } from '../lib/time';
import { useTranslation } from '../i18n/LanguageContext';
import type { EffectivePunch } from '../lib/types';

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
      .gte('effective_time', start)
      .lt('effective_time', end)
      .order('effective_time', { ascending: true });
    setToday((data as EffectivePunch[]) ?? []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const lastKind = today[today.length - 1]?.kind;
  const nextKind: 'in' | 'out' = lastKind === 'in' ? 'out' : 'in';

  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <header className="flex justify-between items-start">
        <div>
          <div className="text-sm text-gray-600">{profile?.full_name}</div>
          <div className="text-2xl font-semibold">{formatDate(new Date().toISOString())}</div>
        </div>
        <LanguagePicker />
      </header>

      <PunchButton kind={nextKind} onSuccess={load} />

      <section>
        <h2 className="font-medium mb-2">{t('home.todayLabel')}</h2>
        {loading ? <div>{t('common.loading')}</div> :
          today.length === 0 ? <div className="text-gray-500">{t('home.noPunchYet')}</div> :
          <ul className="divide-y border rounded bg-white">
            {today.map(p => (
              <li key={p.id} className="px-4 py-2 flex justify-between">
                <span>{p.kind === 'in' ? t('punch.in') : t('punch.out')}</span>
                <span>{formatTime(p.effective_time)}</span>
              </li>
            ))}
          </ul>}
      </section>

      <nav className="flex gap-4 text-sm text-blue-700 underline">
        <Link to="/history">{t('home.myHistory')}</Link>
        <Link to="/submit-edit">{t('home.submitEdit')}</Link>
        {profile?.role === 'admin' && <Link to="/admin">{t('home.adminLink')}</Link>}
      </nav>
    </div>
  );
}
