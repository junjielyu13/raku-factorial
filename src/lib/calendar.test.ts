import { describe, it, expect } from 'vitest';
import { monthGridWeeks } from './calendar';

describe('monthGridWeeks', () => {
  it('returns Monday-first weeks covering the whole month', () => {
    // May 2026: May 1 is a Friday. The first grid week starts Mon Apr 27.
    const weeks = monthGridWeeks('2026-05');
    expect(weeks[0][0]).toBe('2026-04-27'); // Monday before May 1
    expect(weeks[0][4]).toBe('2026-05-01'); // Friday, the 1st
    // Every row is a full Mon–Sun week of 7 day-keys.
    for (const w of weeks) expect(w).toHaveLength(7);
    // The last day of the month is present.
    expect(weeks.flat()).toContain('2026-05-31');
    // The grid ends on a Sunday (last week's last day).
    const last = weeks[weeks.length - 1][6];
    expect(new Date(`${last}T12:00:00Z`).getUTCDay()).toBe(0);
  });

  it('handles a month that starts on Monday with no leading padding', () => {
    // June 2026: June 1 is a Monday.
    const weeks = monthGridWeeks('2026-06');
    expect(weeks[0][0]).toBe('2026-06-01');
  });

  it('produces contiguous ascending day-keys', () => {
    const flat = monthGridWeeks('2026-02').flat();
    for (let i = 1; i < flat.length; i++) {
      const prev = new Date(`${flat[i - 1]}T12:00:00Z`).getTime();
      const cur = new Date(`${flat[i]}T12:00:00Z`).getTime();
      expect(cur - prev).toBe(24 * 60 * 60 * 1000);
    }
  });
});
