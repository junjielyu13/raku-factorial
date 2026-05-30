// Compute worked time from a sequence of in/out punches.
// Pairs each `in` with the next `out` ON THE SAME Madrid day; a trailing
// unmatched `in` is counted up to `openAsOfMs` if provided (null = ignore, i.e.
// day already closed). An `in` with no same-day `out` is left unclosed (a
// forgotten punch-out), so its time is not counted against the next day's `out`.
import type { EffectivePunch } from './types';
import { madridDayKeyOf } from './time';

export function workedMsForDay(punches: EffectivePunch[], openAsOfMs: number | null): number {
  const sorted = [...punches].sort(
    (a, b) => new Date(a.effective_time).getTime() - new Date(b.effective_time).getTime()
  );
  let total = 0;
  let inAt: number | null = null;
  let inDay: string | null = null;
  for (const p of sorted) {
    const t = new Date(p.effective_time).getTime();
    if (p.kind === 'in') {
      if (inAt === null) { inAt = t; inDay = madridDayKeyOf(p.effective_time); }
    } else if (inAt !== null) {
      // Count the pair only when the out is on the same Madrid day as the in.
      if (madridDayKeyOf(p.effective_time) === inDay) total += t - inAt;
      inAt = null;
      inDay = null;
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

// Walk punches ascending and pair each `in` with the next `out` ON THE SAME
// Madrid day. A trailing open `in` (or an `in` whose only following `out` is on
// a later day) becomes an open shift (warning); an `out` with no preceding
// same-day `in` is recorded as a stray-out anomaly. Returned newest-first.
export function pairShifts<T extends { effective_time: string; kind: 'in' | 'out' }>(rows: T[]): ShiftPair<T>[] {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.effective_time).getTime() - new Date(b.effective_time).getTime(),
  );
  const shifts: ShiftPair<T>[] = [];
  let openIn: T | null = null;
  const pushOpen = (p: T) =>
    shifts.push({ date: madridDayKeyOf(p.effective_time), in: p, out: null, isOpen: true, isStrayOut: false });
  for (const p of sorted) {
    if (p.kind === 'in') {
      if (openIn) pushOpen(openIn);
      openIn = p;
    } else {
      if (openIn && madridDayKeyOf(openIn.effective_time) === madridDayKeyOf(p.effective_time)) {
        shifts.push({ date: madridDayKeyOf(openIn.effective_time), in: openIn, out: p, isOpen: false, isStrayOut: false });
        openIn = null;
      } else {
        // No open in, or the open in is from an earlier day: the in is left
        // unclosed and this out is a stray (each its own anomaly).
        if (openIn) { pushOpen(openIn); openIn = null; }
        shifts.push({ date: madridDayKeyOf(p.effective_time), in: null, out: p, isOpen: false, isStrayOut: true });
      }
    }
  }
  if (openIn) pushOpen(openIn);
  return shifts.reverse();
}
