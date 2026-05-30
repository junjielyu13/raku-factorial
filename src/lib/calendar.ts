// src/lib/calendar.ts
// Pure date-grid helpers for the month calendar popover. Operates entirely on
// YYYY-MM-DD day-keys (string-comparable, DST-safe) — no timezone math needed.
import { addDaysKey, madridWeekStartKey } from './time';

/**
 * Month calendar grid as Monday-first weeks of day-keys.
 *
 * @param viewMonthKey `YYYY-MM` of the month to render.
 * @returns array of weeks, each a length-7 array of `YYYY-MM-DD` day-keys.
 *          Padded so the first week starts on the Monday on/before the 1st and
 *          the last week ends on the Sunday on/after the month's final day.
 */
export function monthGridWeeks(viewMonthKey: string): string[][] {
  const [y, m] = viewMonthKey.split('-').map(Number);
  const firstKey = `${viewMonthKey}-01`;
  const pad = (x: number) => String(x).padStart(2, '0');
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month
  const lastKey = `${viewMonthKey}-${pad(lastDay)}`;

  const gridStart = madridWeekStartKey(firstKey);
  const gridEndWeekStart = madridWeekStartKey(lastKey);
  const gridEnd = addDaysKey(gridEndWeekStart, 6);

  const weeks: string[][] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDaysKey(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}
