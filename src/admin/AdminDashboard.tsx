// src/admin/AdminDashboard.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatTime, formatDate } from '../lib/time';
import type { EffectivePunch, Employee } from '../lib/types';

interface Row extends EffectivePunch { employee: Pick<Employee, 'full_name' | 'email'> }

function todayWindowMadrid(): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  const start = new Date(`${y}-${m}-${d}T00:00:00+02:00`);
  const end   = new Date(start.getTime() + 24*60*60*1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function AdminDashboard() {
  const [rows, setRows] = useState<Row[]>([]);

  async function load() {
    const { start, end } = todayWindowMadrid();
    const { data } = await supabase
      .from('effective_punches')
      .select('*, employee:employees!effective_punches_employee_id_fkey(full_name, email)')
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
          {rows.map(r => (
            <li key={r.id} className="px-4 py-2 flex justify-between">
              <span>{r.employee.full_name}</span>
              <span>{r.kind === 'in' ? '上班' : '下班'} · {formatTime(r.effective_time)}</span>
            </li>
          ))}
        </ul>}
    </div>
  );
}
