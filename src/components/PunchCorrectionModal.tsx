// src/components/PunchCorrectionModal.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { adminCorrectPunch } from '../lib/api';
import type { ApiError } from '../lib/api';
import { useTranslation } from '../i18n/LanguageContext';
import { formatDateTime } from '../lib/time';

export interface CorrectionTarget {
  effective_id: string;
  employee_name: string;
  kind: 'in' | 'out';
  effective_time: string;   // ISO
}

type Props =
  | {
      mode: 'add';
      employees: { id: string; full_name: string }[];
      onClose: () => void;
      onDone: () => void;
    }
  | {
      mode: 'modify';
      target: CorrectionTarget;
      onClose: () => void;
      onDone: () => void;
    }
  | {
      mode: 'delete';
      // One target for an open shift / stray out, two for a full shift.
      targets: CorrectionTarget[];
      onClose: () => void;
      onDone: () => void;
    }
  | {
      // Add the missing punch of an incomplete shift. Employee and kind are
      // fixed by the row that was clicked; the admin only enters time + reason.
      mode: 'add-missing';
      employeeId: string;
      employeeName: string;
      kind: 'in' | 'out';
      onClose: () => void;
      onDone: () => void;
    };

// ISO → datetime-local input value (browser local TZ; new Date(value) reads it back consistently)
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PunchCorrectionModal(props: Props) {
  const { t } = useTranslation();
  const [employeeId, setEmployeeId] = useState('');
  const initialKind =
    props.mode === 'modify' ? props.target.kind
    : props.mode === 'add-missing' ? props.kind
    : 'in';
  const initialIso = props.mode === 'modify' ? props.target.effective_time : '';
  const [kind, setKind] = useState<'in' | 'out'>(initialKind);
  const [datetime, setDatetime] = useState(initialIso ? toLocalInput(initialIso) : '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const titleKey =
    props.mode === 'add' || props.mode === 'add-missing' ? 'admin.correct.modalAddTitle'
    : props.mode === 'modify' ? 'admin.correct.modalModifyTitle'
    : 'admin.correct.modalDeleteTitle';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (props.mode === 'add' || props.mode === 'add-missing') {
        await adminCorrectPunch({
          action: 'add',
          employee_id: props.mode === 'add' ? employeeId : props.employeeId,
          kind,
          time: new Date(datetime).toISOString(), reason,
        });
      } else if (props.mode === 'modify') {
        await adminCorrectPunch({
          action: 'modify', target_effective_id: props.target.effective_id, kind,
          time: new Date(datetime).toISOString(), reason,
        });
      } else {
        // Delete each target sequentially so per-target server validation runs cleanly.
        for (const tgt of props.targets) {
          await adminCorrectPunch({
            action: 'delete', target_effective_id: tgt.effective_id, reason,
          });
        }
      }
      props.onDone();
    } catch (e: unknown) {
      const apiErr = e as ApiError;
      const known = t(`admin.correct.errors.${apiErr.code}`, { code: apiErr.code });
      setErr(known.startsWith('admin.correct.errors.')
        ? t('admin.correct.errors.UNKNOWN', { code: apiErr.code })
        : known);
    } finally {
      setBusy(false);
    }
  }

  const deleteTargets = props.mode === 'delete' ? props.targets : [];
  const modifyTarget = props.mode === 'modify' ? props.target : null;
  const summaryEmployeeName =
    props.mode === 'add-missing' ? props.employeeName
    : modifyTarget?.employee_name ?? deleteTargets[0]?.employee_name ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={props.onClose}>
      <div className="app-card w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900">{t(titleKey)}</h2>

        <form onSubmit={submit} className="space-y-4">
          {props.mode === 'add' && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">{t('admin.correct.employeeLabel')}</span>
              <select required value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="app-input">
                <option value="">{t('admin.correct.selectEmployee')}</option>
                {props.employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </select>
            </label>
          )}

          {(props.mode === 'modify' || props.mode === 'delete' || props.mode === 'add-missing') && summaryEmployeeName && (
            <div className="text-sm text-slate-600">
              <span className="text-slate-500">{t('admin.correct.employeeLabel')}: </span>
              {summaryEmployeeName}
            </div>
          )}

          {props.mode === 'delete' && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 space-y-1">
              {deleteTargets.map(tgt => (
                <div key={tgt.effective_id}>
                  {tgt.kind === 'in' ? t('punch.in') : t('punch.out')} · {formatDateTime(tgt.effective_time)}
                </div>
              ))}
            </div>
          )}

          {(props.mode === 'add' || props.mode === 'modify' || props.mode === 'add-missing') && (
            <>
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">{t('admin.correct.typeLabel')}</span>
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                  {(['in', 'out'] as const).map(k => (
                    <button type="button" key={k} onClick={() => setKind(k)}
                      disabled={props.mode === 'add-missing'}
                      className={`py-2 rounded-md text-sm font-medium transition disabled:cursor-not-allowed ${kind === k ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}>
                      {t(`punch.${k}`)}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">{t('admin.correct.timeLabel')}</span>
                <input type="datetime-local" required max={toLocalInput(new Date().toISOString())}
                  value={datetime} onChange={e => setDatetime(e.target.value)} className="app-input" />
              </label>
            </>
          )}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t('admin.correct.reasonLabel')}</span>
            <textarea required value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder={t('admin.correct.reasonPlaceholder')} className="app-input resize-none" />
          </label>

          {err && (
            <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{err}</div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={props.onClose}
              className="flex-1 py-2 rounded-lg bg-white ring-1 ring-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition">
              {t('admin.correct.cancel')}
            </button>
            <button type="submit" disabled={busy}
              className={`flex-1 py-2 rounded-lg text-white font-medium disabled:opacity-60 transition ${props.mode === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {busy ? t('admin.correct.saving') : props.mode === 'delete' ? t('admin.correct.confirmDelete') : t('admin.correct.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
