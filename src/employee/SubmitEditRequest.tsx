// src/employee/SubmitEditRequest.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { submitEditRequest } from '../lib/api';
import type { ApiError } from '../lib/api';

export function SubmitEditRequest() {
  const nav = useNavigate();
  const [kind, setKind] = useState<'in' | 'out'>('in');
  const [datetime, setDatetime] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const iso = new Date(datetime).toISOString();
      await submitEditRequest({ requested_kind: kind, requested_time: iso, reason });
      nav('/', { replace: true });
    } catch (e: unknown) {
      const apiErr = e as ApiError;
      const labels: Record<string, string> = {
        FUTURE_TIME: '时间不能是未来。',
        BAD_REASON:  '原因不能为空。',
        BAD_TIME:    '时间格式不正确。',
        BAD_KIND:    '类型不正确。',
      };
      setErr(labels[apiErr.code] ?? `提交失败：${apiErr.code}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <Link to="/" className="text-blue-700 underline text-sm">← 返回</Link>
      <h1 className="text-xl font-semibold">补卡申请</h1>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-sm">类型</span>
          <select value={kind} onChange={e => setKind(e.target.value as 'in' | 'out')}
            className="w-full px-3 py-2 border rounded">
            <option value="in">上班</option>
            <option value="out">下班</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm">实际时间</span>
          <input type="datetime-local" required value={datetime} onChange={e => setDatetime(e.target.value)}
            className="w-full px-3 py-2 border rounded" />
        </label>
        <label className="block">
          <span className="text-sm">原因</span>
          <textarea required value={reason} onChange={e => setReason(e.target.value)}
            rows={3} className="w-full px-3 py-2 border rounded" />
        </label>
        <button type="submit" disabled={busy}
          className="w-full py-2 bg-blue-600 text-white rounded disabled:opacity-50">
          {busy ? '提交中…' : '提交'}
        </button>
        {err && <div className="text-red-700 text-sm">{err}</div>}
      </form>
    </div>
  );
}
