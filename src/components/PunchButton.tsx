// src/components/PunchButton.tsx
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
      // If translation key didn't exist, t() returns the path — fall back to generic UNKNOWN message
      setErr(known.startsWith('punch.errors.') ? t('punch.errors.UNKNOWN', { code }) : known);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button onClick={go} disabled={busy}
        className={`w-full py-4 text-white font-semibold rounded ${kind === 'in' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'} disabled:opacity-50`}>
        {busy ? <Spinner /> : (kind === 'in' ? t('punch.punchIn') : t('punch.punchOut'))}
      </button>
      {err && <div className="text-red-700 text-sm">{err}</div>}
    </div>
  );
}
