// src/admin/AdminApprovals.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { approveEdit, rejectEdit } from '../lib/api';
import type { ApiError } from '../lib/api';
import { formatDateTime } from '../lib/time';
import { useTranslation } from '../i18n/LanguageContext';
import type { PunchEditRequest, Employee } from '../lib/types';

interface Row extends PunchEditRequest { employee: Pick<Employee, 'full_name' | 'email'> }

export function AdminApprovals() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from('punch_edit_requests')
      .select('*, employee:employees!punch_edit_requests_employee_id_fkey(full_name, email)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    setRows((data as unknown as Row[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  async function decide(id: string, kind: 'approve' | 'reject') {
    setBusy(id); setErr(null);
    try {
      if (kind === 'approve') await approveEdit(id, '');
      else await rejectEdit(id, '');
      await load();
    } catch (e: unknown) {
      const apiErr = e as ApiError;
      setErr(t(kind === 'approve' ? 'admin.approvals.approveFailed' : 'admin.approvals.rejectFailed', { code: apiErr.code }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <Link to="/admin" className="text-blue-700 underline text-sm">{t('common.back')}</Link>
      <h1 className="text-xl font-semibold">{t('admin.approvals.title')}</h1>
      {err && <div className="text-red-700">{err}</div>}
      {rows.length === 0 ? <div className="text-gray-500">{t('admin.approvals.none')}</div> :
        <ul className="space-y-3">
          {rows.map(r => (
            <li key={r.id} className="border rounded bg-white p-4 space-y-2">
              <div className="font-medium">{r.employee.full_name}</div>
              <div className="text-sm text-gray-700">
                {t('admin.approvals.requestLabel')}{r.requested_kind === 'in' ? t('punch.in') : t('punch.out')} @ {formatDateTime(r.requested_time)}
              </div>
              <div className="text-sm">{t('admin.approvals.reasonLabel')}{r.reason}</div>
              <div className="flex gap-2">
                <button onClick={() => decide(r.id, 'approve')} disabled={busy === r.id}
                  className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-50">{t('admin.approvals.approve')}</button>
                <button onClick={() => decide(r.id, 'reject')} disabled={busy === r.id}
                  className="px-3 py-1 bg-red-600 text-white rounded disabled:opacity-50">{t('admin.approvals.reject')}</button>
              </div>
            </li>
          ))}
        </ul>}
    </div>
  );
}
