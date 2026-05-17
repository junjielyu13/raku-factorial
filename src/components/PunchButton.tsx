// src/components/PunchButton.tsx
import { useState } from 'react';
import { punchIn } from '../lib/api';
import { getPosition } from '../lib/geolocation';
import type { Coords } from '../lib/geolocation';
import { Spinner } from './Spinner';

const ERR_LABELS: Record<string, string> = {
  TOO_SOON:         '刚打过卡了，请稍等一会再试。',
  INVALID_SEQUENCE: '打卡顺序不对（上班/下班）。如有问题请提交补卡申请。',
  MISSING_AUTH:     '请重新登录。',
  INVALID_JWT:      '请重新登录。',
  NOT_EMPLOYEE:     '账号未在系统注册，请联系管理员。',
  INACTIVE:         '账号已停用。',
};

interface Props {
  kind: 'in' | 'out';
  onSuccess: () => void;
}

export function PunchButton({ kind, onSuccess }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  async function go() {
    setBusy(true); setErr(null);
    try {
      // GPS is recorded for audit only — failure to obtain it doesn't block punching.
      let coords: Coords | null = null;
      try {
        coords = await getPosition();
      } catch {
        // Browser permission denied / timeout / no GPS — punch anyway with null coords.
      }
      await punchIn({
        kind,
        latitude:   coords?.latitude   ?? null,
        longitude:  coords?.longitude  ?? null,
        accuracy_m: coords?.accuracy_m ?? null,
      });
      onSuccess();
    } catch (e: unknown) {
      const code =
        (e && typeof e === 'object' && 'code' in e ? (e as {code: string}).code : null)
        ?? (e instanceof Error ? e.message : null)
        ?? 'UNKNOWN';
      setErr(ERR_LABELS[code] ?? `打卡失败：${code}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button onClick={go} disabled={busy}
        className={`w-full py-4 text-white font-semibold rounded ${kind === 'in' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'} disabled:opacity-50`}>
        {busy ? <Spinner /> : (kind === 'in' ? '上班打卡' : '下班打卡')}
      </button>
      {err && <div className="text-red-700 text-sm">{err}</div>}
    </div>
  );
}
