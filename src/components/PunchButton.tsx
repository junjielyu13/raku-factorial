// src/components/PunchButton.tsx
import { useState } from 'react';
import { punchIn } from '../lib/api';
import { getPosition } from '../lib/geolocation';
import { Spinner } from './Spinner';

const ERR_LABELS: Record<string, string> = {
  // GPS-side errors (thrown by getPosition before we hit the API)
  PERMISSION_DENIED: '需要位置权限才能打卡。请在浏览器设置里允许定位后重试。',
  UNAVAILABLE:       '无法获取定位。请到窗边或开启 GPS 后重试。',
  TIMEOUT:           '定位超时，请重试。',
  NO_GEOLOCATION:    '当前浏览器不支持定位。',
  // Server-side errors
  GPS_REQUIRED:      '必须提供 GPS 坐标才能打卡。',
  TOO_SOON:          '刚打过卡了，请稍等一会再试。',
  INVALID_SEQUENCE:  '打卡顺序不对（上班/下班）。如有问题请提交补卡申请。',
  MISSING_AUTH:      '请重新登录。',
  INVALID_JWT:       '请重新登录。',
  NOT_EMPLOYEE:      '账号未在系统注册，请联系管理员。',
  INACTIVE:          '账号已停用。',
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
      // GPS is required — if we can't get it, abort with a friendly message.
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
