// Company-wide vacation periods (Madrid YYYY-MM-DD, both ends inclusive).
// On these days nobody is expected to clock in: no absence flags, no backfill,
// and the admin dashboard labels the day as vacation. Add a new entry each year.
export const COMPANY_VACATIONS: { start: string; end: string }[] = [
  { start: '2026-08-03', end: '2026-08-24' },
];

export function isVacationDay(dateKey: string): boolean {
  return COMPANY_VACATIONS.some(v => v.start <= dateKey && dateKey <= v.end);
}
