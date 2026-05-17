// src/employee/EmployeeHistory.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { formatDateTime } from '../lib/time';
import type { EffectivePunch } from '../lib/types';

export function EmployeeHistory() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<EffectivePunch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const since = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    supabase.from('effective_punches')
      .select('*').eq('employee_id', profile.id)
      .gte('effective_time', since)
      .order('effective_time', { ascending: false })
      .then(({ data }) => { setRows((data as EffectivePunch[]) ?? []); setLoading(false); });
  }, [profile]);

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <Link to="/" className="text-blue-700 underline text-sm">← 返回</Link>
      <h1 className="text-xl font-semibold">最近 30 天</h1>
      {loading ? <div>加载中…</div> :
        rows.length === 0 ? <div className="text-gray-500">暂无记录</div> :
        <ul className="divide-y border rounded bg-white">
          {rows.map(r => (
            <li key={r.id} className="px-4 py-2 flex justify-between">
              <span>{r.kind === 'in' ? '上班' : '下班'}</span>
              <span className="text-gray-700">{formatDateTime(r.effective_time)}</span>
            </li>
          ))}
        </ul>}
    </div>
  );
}
