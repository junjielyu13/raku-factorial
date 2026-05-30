// src/components/EditRequestModal.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { submitEditRequest } from '../lib/api';
import type { ApiError } from '../lib/api';
import { useTranslation } from '../i18n/LanguageContext';
import { MESSAGES } from '../i18n/messages';
import { formatDateTime } from '../lib/time';

export interface EditTarget {
  effective_id: string;
  kind: 'in' | 'out';
  effective_time: string; // ISO
}

type Props =
  | {
      mode: 'modify';
      target: EditTarget;
      onClose: () => void;
      onDone: () => void;
    }
  | {
      mode: 'delete';
      // For a full shift this is [in, out]; for an open shift / stray-out it's a single punch.
      targets: EditTarget[];
      onClose: () => void;
      onDone: () => void;
    }
  | {
      // Add the missing punch of an incomplete shift. The kind is fixed
      // (the user clicked the strayOut or openShift chip); they enter
      // when the punch should have been + a reason.
      mode: 'add';
      kind: 'in' | 'out';
      onClose: () => void;
      onDone: () => void;
    };

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditRequestModal(props: Props) {
  const { t, lang } = useTranslation();
  const commonReasons = MESSAGES[lang].editRequest.commonReasons;
  const initialIso = props.mode === 'modify' ? props.target.effective_time : '';
  const [datetime, setDatetime] = useState(initialIso ? toLocalInput(initialIso) : '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (props.mode === 'modify') {
        await submitEditRequest({
          action: 'modify',
          target_effective_id: props.target.effective_id,
          requested_time: new Date(datetime).toISOString(),
          reason,
        });
      } else if (props.mode === 'add') {
        await submitEditRequest({
          action: 'add',
          requested_kind: props.kind,
          requested_time: new Date(datetime).toISOString(),
          reason,
        });
      } else {
        // Fire a delete request per punch in the shift, sequentially so the
        // server's per-target validation runs cleanly for each.
        for (const tgt of props.targets) {
          await submitEditRequest({
            action: 'delete',
            target_effective_id: tgt.effective_id,
            reason,
          });
        }
      }
      props.onDone();
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

  const title =
    props.mode === 'modify' ? t('editRequest.requestModifyTitle')
    : props.mode === 'add' ? t('editRequest.requestAddTitle')
    : t('editRequest.requestDeleteTitle');
  const action =
    props.mode === 'modify' ? t('editRequest.requestModifyAction')
    : props.mode === 'add' ? t('editRequest.requestAddAction')
    : t('editRequest.requestDeleteAction');
  const summaryTargets = props.mode === 'modify' ? [props.target] : props.mode === 'delete' ? props.targets : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={props.onClose}>
      <div className="app-card w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>

        <form onSubmit={submit} className="space-y-4">
          {summaryTargets.length > 0 && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 space-y-1">
              {summaryTargets.map(tgt => (
                <div key={tgt.effective_id}>
                  {tgt.kind === 'in' ? t('punch.in') : t('punch.out')} · {formatDateTime(tgt.effective_time)}
                </div>
              ))}
            </div>
          )}

          {props.mode === 'add' && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {props.kind === 'in' ? t('punch.in') : t('punch.out')}
            </div>
          )}

          {(props.mode === 'modify' || props.mode === 'add') && (
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

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t('editRequest.reason')}</span>
            <div className="flex flex-wrap gap-2">
              <span className="w-full text-xs text-slate-500">{t('editRequest.commonReasonsHint')}</span>
              {commonReasons.map(r => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setReason(r)}
                  className={`rounded-full px-3 py-1 text-sm ring-1 transition ${
                    reason === r
                      ? 'bg-emerald-600 text-white ring-emerald-600'
                      : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              required
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              className="app-input resize-none"
            />
          </div>

          <p className="text-xs text-slate-500">{t('editRequest.pendingHint')}</p>

          {err && (
            <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{err}</div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={props.onClose}
              className="flex-1 py-2 rounded-lg bg-white ring-1 ring-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition"
            >
              {t('editRequest.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className={`flex-1 py-2 rounded-lg text-white font-medium disabled:opacity-60 transition ${props.mode === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            >
              {busy ? t('editRequest.submitting') : action}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
