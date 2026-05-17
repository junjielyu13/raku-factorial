// src/admin/AdminDashboard.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatTime, formatDate, madridTodayRange } from '../lib/time';
import type { EffectivePunch, Employee } from '../lib/types';

interface Row extends EffectivePunch {
  employee: Pick<Employee, 'full_name' | 'email'>;
  punch: { latitude: number | null; longitude: number | null; accuracy_m: number | null } | null;
}

export function AdminDashboard() {
  const [rows, setRows] = useState<Row[]>([]);

  async function load() {
    const { start, end } = madridTodayRange();
    const { data } = await supabase
      .from('effective_punches')
      .select(`
        *,
        employee:employees!effective_punches_employee_id_fkey(full_name, email),
        punch:punches!effective_punches_source_punch_id_fkey(latitude, longitude, accuracy_m)
      `)
      .gte('effective_time', start)
      .lt('effective_time', end)
      .order('effective_time', { ascending: false });
    setRows((data as unknown as Row[]) ?? []);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel('punches')
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'effective_punches' },
          () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">今日打卡 — {formatDate(new Date().toISOString())}</h1>
        <nav className="flex gap-3 text-sm text-blue-700 underline">
          <Link to="/admin/approvals">审批</Link>
          <Link to="/admin/export">导出</Link>
          <Link to="/">员工视图</Link>
        </nav>
      </header>
      {rows.length === 0 ? <div className="text-gray-500">今天还没人打卡</div> :
        <ul className="divide-y border rounded bg-white">
          {rows.map(r => {
            const lat = r.punch?.latitude;
            const lng = r.punch?.longitude;
            const hasGps = typeof lat === 'number' && typeof lng === 'number';
            return (
              <li key={r.id} className="px-4 py-2 flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="font-medium">{r.employee.full_name}</span>
                  <span>{r.kind === 'in' ? '上班' : '下班'} · {formatTime(r.effective_time)}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {hasGps ? (
                    <a
                      href={`https://www.google.com/maps?q=${lat},${lng}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-blue-700 hover:underline"
                    >
                      📍 {lat.toFixed(5)}, {lng.toFixed(5)}
                      {typeof r.punch?.accuracy_m === 'number' && ` · ±${Math.round(r.punch.accuracy_m)}m`}
                    </a>
                  ) : (
                    <span>📍 无 GPS 数据</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>}
    </div>
  );
}
