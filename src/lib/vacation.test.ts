import { describe, it, expect } from 'vitest';
import { isVacationDay } from './vacation';

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
