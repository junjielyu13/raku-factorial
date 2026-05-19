// src/components/EditRequestModal.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { submitEditRequest } from '../lib/api';
import type { ApiError } from '../lib/api';
import { useTranslation } from '../i18n/LanguageContext';
import { formatDateTime } from '../lib/time';

export interface EditTarget {
  effective_id: string;
  kind: 'in' | 'out';
  effective_time: string; // ISO
}

interface Props {
  mode: 'modify' | 'delete';
  target: EditTarget;
  onClose: () => void;
  onDone: () => void;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditRequestModal({ mode, target, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [datetime, setDatetime] = useState(toLocalInput(target.effective_time));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (mode === 'modify') {
        await submitEditRequest({
          action: 'modify',
          target_effective_id: target.effective_id,
          requested_time: new Date(datetime).toISOString(),
          reason,
        });
      } else {
        await submitEditRequest({
          action: 'delete',
          target_effective_id: target.effective_id,
          reason,
        });
      }
      onDone();
    } catch (e: unknown) {
      const apiErr = e as ApiError;
      const known = t(`editRequest.errors.${apiErr.code}`, { code: apiErr.code });
      setErr(known.startsWith('editRequest.errors.')
        ? t('editRequest.errors.UNKNOWN', { code: apiErr.code })
        : known);
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'modify' ? t('editRequest.requestModifyTitle') : t('editRequest.requestDeleteTitle');
  const action = mode === 'modify' ? t('editRequest.requestModifyAction') : t('editRequest.requestDeleteAction');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <div className="app-card w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>

        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {target.kind === 'in' ? t('punch.in') : t('punch.out')} · {formatDateTime(target.effective_time)}
          </div>

          {mode === 'modify' && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">{t('editRequest.actualTime')}</span>
              <input
                type="datetime-local"
                required
                max={toLocalInput(new Date().toISOString())}
                value={datetime}
                onChange={e => setDatetime(e.target.value)}
                className="app-input"
              />
            </label>
          )}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t('editRequest.reason')}</span>
            <textarea
              required
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              className="app-input resize-none"
            />
          </label>

          <p className="text-xs text-slate-500">{t('editRequest.pendingHint')}</p>

          {err && (
            <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{err}</div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg bg-white ring-1 ring-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition"
            >
              {t('editRequest.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className={`flex-1 py-2 rounded-lg text-white font-medium disabled:opacity-60 transition ${mode === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            >
              {busy ? t('editRequest.submitting') : action}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
