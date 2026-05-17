import { useState } from 'react';
import { punchIn } from '../lib/api';
import { getPosition } from '../lib/geolocation';
import { Spinner } from './Spinner';
import { useTranslation } from '../i18n/LanguageContext';

interface Props {
  kind: 'in' | 'out';
  onSuccess: () => void;
}

export function PunchButton({ kind, onSuccess }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  async function go() {
    setBusy(true); setErr(null);
    try {
      const coords = await getPosition();
      await punchIn({
        kind,
        latitude:   coords.latitude,
        longitude:  coords.longitude,
        accuracy_m: coords.accuracy_m,
      });
      onSuccess();
    } catch (e: unknown) {
      const code =
        (e && typeof e === 'object' && 'code' in e ? (e as {code: string}).code : null)
        ?? (e instanceof Error ? e.message : null)
        ?? 'UNKNOWN';
      const known = t(`punch.errors.${code}`, { code });
      if (known.startsWith('punch.errors.')) {
        const status = (e && typeof e === 'object' && 'status' in e ? (e as { status: number }).status : null);
        const message = (e && typeof e === 'object' && 'message' in e ? (e as { message: string }).message : null);
        const detail = [status, code, message].filter(Boolean).join(' · ');
        setErr(t('punch.errors.UNKNOWN', { code: detail || 'UNKNOWN' }));
      } else {
        setErr(known);
      }
    } finally {
      setBusy(false);
    }
  }

  const baseColor = kind === 'in'
    ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 ring-emerald-700/10'
    : 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 ring-amber-700/10';

  return (
    <div className="space-y-3">
      <button
        onClick={go}
        disabled={busy}
        className={`w-full h-24 rounded-2xl text-white text-xl font-semibold shadow-md ring-1 transition active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed ${baseColor}`}
      >
        {busy ? (
          <span className="inline-flex items-center gap-2"><Spinner /> …</span>
        ) : (
          <span className="inline-flex items-center gap-3">
            <span className="text-2xl leading-none">{kind === 'in' ? '▶' : '■'}</span>
            <span>{kind === 'in' ? t('punch.punchIn') : t('punch.punchOut')}</span>
          </span>
        )}
      </button>
      {err && (
        <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
          {err}
        </div>
      )}
    </div>
  );
}
