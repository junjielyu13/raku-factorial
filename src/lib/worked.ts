// Compute worked time from a sequence of in/out punches.
// Pairs each `in` with the next `out`; a trailing unmatched `in` is counted up
// to `openAsOfMs` if provided (null = ignore, i.e. day already closed).
import type { EffectivePunch } from './types';

export function workedMsForDay(punches: EffectivePunch[], openAsOfMs: number | null): number {
  const sorted = [...punches].sort(
    (a, b) => new Date(a.effective_time).getTime() - new Date(b.effective_time).getTime()
  );
  let total = 0;
  let inAt: number | null = null;
  for (const p of sorted) {
    const t = new Date(p.effective_time).getTime();
    if (p.kind === 'in') {
      if (inAt === null) inAt = t;
    } else if (inAt !== null) {
      total += t - inAt;
      inAt = null;
    }
  }
  if (inAt !== null && openAsOfMs !== null) total += Math.max(0, openAsOfMs - inAt);
  return total;
}

export function msToHm(ms: number): { h: number; m: number } {
  const totalMin = Math.floor(ms / 60_000);
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}
