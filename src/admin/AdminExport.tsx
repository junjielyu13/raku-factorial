// src/admin/AdminExport.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { exportMonthCsv } from '../lib/api';
import type { ApiError } from '../lib/api';
import { currentMonthKey } from '../lib/time';

export function AdminExport() {
  const [month, setMonth] = useState(currentMonthKey());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true); setErr(null);
    try {
      const csv = await exportMonthCsv(month);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `punches-${month}.csv`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setErr(`导出失败：${(e as ApiError).code}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <Link to="/admin" className="text-blue-700 underline text-sm">← 返回</Link>
      <h1 className="text-xl font-semibold">导出月度 CSV</h1>
      <label className="block">
        <span className="text-sm">月份 (YYYY-MM)</span>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="w-full px-3 py-2 border rounded" />
      </label>
      <button onClick={go} disabled={busy}
        className="w-full py-2 bg-blue-600 text-white rounded disabled:opacity-50">
        {busy ? '生成中…' : '下载 CSV'}
      </button>
      {err && <div className="text-red-700">{err}</div>}
    </div>
  );
}
