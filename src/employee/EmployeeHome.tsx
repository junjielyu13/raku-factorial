// src/employee/EmployeeHome.tsx
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { PunchButton } from '../components/PunchButton';
import { formatTime, formatDate, madridTodayRange } from '../lib/time';
import type { EffectivePunch } from '../lib/types';

export function EmployeeHome() {
  const { profile } = useAuth();
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
      <header>
        <div className="text-sm text-gray-600">{profile?.full_name}</div>
        <div className="text-2xl font-semibold">{formatDate(new Date().toISOString())}</div>
      </header>

      <PunchButton kind={nextKind} onSuccess={load} />

      <section>
        <h2 className="font-medium mb-2">今天</h2>
        {loading ? <div>加载中…</div> :
          today.length === 0 ? <div className="text-gray-500">还没打卡</div> :
          <ul className="divide-y border rounded bg-white">
            {today.map(p => (
              <li key={p.id} className="px-4 py-2 flex justify-between">
                <span>{p.kind === 'in' ? '上班' : '下班'}</span>
                <span>{formatTime(p.effective_time)}</span>
              </li>
            ))}
          </ul>}
      </section>

      <nav className="flex gap-4 text-sm text-blue-700 underline">
        <Link to="/history">我的历史</Link>
        <Link to="/submit-edit">补卡申请</Link>
        {profile?.role === 'admin' && <Link to="/admin">管理</Link>}
      </nav>
    </div>
  );
}
