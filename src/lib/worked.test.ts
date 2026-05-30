import { describe, it, expect } from 'vitest';
import { pairShifts, workedMsForDay } from './worked';

// May 2026 is CEST (UTC+2).
const punch = (kind: 'in' | 'out', isoUtc: string) => ({ kind, effective_time: isoUtc });

describe('pairShifts — same-day pairing', () => {
  it('pairs an in/out on the same Madrid day into one complete shift', () => {
    const shifts = pairShifts([
      punch('in', '2026-05-28T10:31:00Z'),   // 12:31 Madrid, 28th
      punch('out', '2026-05-28T14:58:00Z'),  // 16:58 Madrid, 28th
    ]);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toMatchObject({ isOpen: false, isStrayOut: false });
    expect(shifts[0].in && shifts[0].out).toBeTruthy();
  });

  it('does NOT bridge an in and an out that fall on different Madrid days', () => {
    // Wu's case: in on the 28th (evening), out on the 29th (midday).
    const shifts = pairShifts([
      punch('in', '2026-05-28T15:06:11Z'),   // 17:06 Madrid, 28th
      punch('out', '2026-05-29T10:20:18Z'),  // 12:20 Madrid, 29th
    ]);
    expect(shifts).toHaveLength(2);
    // No shift should be a complete cross-day pair.
    expect(shifts.every(s => !(s.in && s.out))).toBe(true);
    const open = shifts.find(s => s.isOpen);
    const stray = shifts.find(s => s.isStrayOut);
    expect(open?.date).toBe('2026-05-28');
    expect(open?.out).toBeNull();
    expect(stray?.date).toBe('2026-05-29');
    expect(stray?.in).toBeNull();
  });
});

describe('workedMsForDay — same-day pairing', () => {
  it('counts an in/out on the same Madrid day', () => {
    const ms = workedMsForDay([
      punch('in', '2026-05-28T10:31:00Z'),
      punch('out', '2026-05-28T14:58:00Z'),
    ], null);
    expect(ms).toBe((4 * 60 + 27) * 60_000); // 4h27m
  });

  it('does NOT count an in paired with an out on a different Madrid day', () => {
    const ms = workedMsForDay([
      punch('in', '2026-05-28T15:06:11Z'),
      punch('out', '2026-05-29T10:20:18Z'),
    ], null);
    expect(ms).toBe(0);
  });

  it('counts only the same-day pair when a cross-day pair is also present', () => {
    const ms = workedMsForDay([
      punch('in', '2026-05-28T15:06:11Z'),   // open (no same-day out)
      punch('out', '2026-05-29T10:20:18Z'),  // stray, different day
      punch('in', '2026-05-29T17:30:00Z'),   // 19:30 Madrid, 29th
      punch('out', '2026-05-29T21:00:00Z'),  // 23:00 Madrid, 29th -> 3h30m
    ], null);
    expect(ms).toBe((3 * 60 + 30) * 60_000);
  });
});
