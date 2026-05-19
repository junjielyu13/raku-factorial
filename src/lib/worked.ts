// Compute worked time from a sequence of in/out punches.
// Pairs each `in` with the next `out`; a trailing unmatched `in` is counted up
// to `openAsOfMs` if provided (null = ignore, i.e. day already closed).
import type { EffectivePunch } from './types';
import { madridDayKeyOf } from './time';

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

export interface ShiftPair<T extends { effective_time: string; kind: 'in' | 'out' }> {
  date: string;         // Madrid YYYY-MM-DD of anchoring punch
  in: T | null;
  out: T | null;
  isOpen: boolean;      // in with no matching out
  isStrayOut: boolean;  // out with no preceding in
}

// Walk punches ascending and pair each `in` with the next `out`. A trailing
// open `in` becomes an open shift (warning); an `out` with no preceding `in`
// is recorded as a stray-out anomaly. Returned newest-first.
export function pairShifts<T extends { effective_time: string; kind: 'in' | 'out' }>(rows: T[]): ShiftPair<T>[] {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.effective_time).getTime() - new Date(b.effective_time).getTime(),
  );
  const shifts: ShiftPair<T>[] = [];
  let openIn: T | null = null;
  for (const p of sorted) {
    if (p.kind === 'in') {
      if (openIn) {
        shifts.push({ date: madridDayKeyOf(openIn.effective_time), in: openIn, out: null, isOpen: true, isStrayOut: false });
      }
      openIn = p;
    } else {
      if (openIn) {
        shifts.push({ date: madridDayKeyOf(openIn.effective_time), in: openIn, out: p, isOpen: false, isStrayOut: false });
        openIn = null;
      } else {
        shifts.push({ date: madridDayKeyOf(p.effective_time), in: null, out: p, isOpen: false, isStrayOut: true });
      }
    }
  }
  if (openIn) {
    shifts.push({ date: madridDayKeyOf(openIn.effective_time), in: openIn, out: null, isOpen: true, isStrayOut: false });
  }
  return shifts.reverse();
}
