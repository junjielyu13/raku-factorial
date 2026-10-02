import { describe, it, expect } from 'vitest';
import { isVacationDay, vacationsInYear } from './vacation';

describe('isVacationDay', () => {
  it('covers the 2026 summer vacation, both ends inclusive', () => {
    expect(isVacationDay('2026-08-03')).toBe(true);
    expect(isVacationDay('2026-08-15')).toBe(true);
    expect(isVacationDay('2026-08-24')).toBe(true);
  });

  it('is false just outside the range', () => {
    expect(isVacationDay('2026-08-02')).toBe(false);
    expect(isVacationDay('2026-08-25')).toBe(false);
  });
});

describe('vacationsInYear', () => {
  it('only returns that year\'s vacation — it does not recur', () => {
    expect(vacationsInYear('2026')).toEqual([{ start: '2026-08-03', end: '2026-08-24' }]);
    expect(vacationsInYear('2027')).toEqual([]);
    expect(isVacationDay('2027-08-10')).toBe(false);
  });
});
