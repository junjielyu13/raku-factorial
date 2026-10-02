// Company-wide vacation periods (Madrid YYYY-MM-DD, both ends inclusive).
// On these days nobody is expected to clock in: no absence flags, no backfill,
// and the admin dashboard labels the day as vacation. Each entry is a one-off
// for that specific year — dates differ year to year, nothing recurs.
export const COMPANY_VACATIONS: { start: string; end: string }[] = [
  { start: '2026-08-03', end: '2026-08-24' },
];

export function isVacationDay(dateKey: string): boolean {
  return COMPANY_VACATIONS.some(v => v.start <= dateKey && dateKey <= v.end);
}

// Vacation periods touching the given year (for the rules card).
export function vacationsInYear(year: string): { start: string; end: string }[] {
  return COMPANY_VACATIONS.filter(v => v.start.slice(0, 4) <= year && year <= v.end.slice(0, 4));
}
