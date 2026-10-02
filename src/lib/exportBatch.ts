// Helpers for the admin export page: filter out non-punching accounts (IT)
// and split one period's punches into per-employee batches (one file each).
import type { PunchRow } from './monthlyPdf';
import type { Employee } from './types';

// Drop punches belonging to employees with any of `roles` (e.g. ['it']).
export function withoutRoles(
  punches: PunchRow[],
  staff: { id: string; role: Employee['role'] }[],
  roles: Employee['role'][],
): PunchRow[] {
  const excluded = new Set(staff.filter(e => roles.includes(e.role)).map(e => e.id));
  return punches.filter(r => !excluded.has(r.employee_id));
}

export interface EmployeeBatch { employeeId: string; name: string; punches: PunchRow[] }

// One batch per employee that has punches, sorted by name.
export function splitByEmployee(punches: PunchRow[]): EmployeeBatch[] {
  const byId = new Map<string, EmployeeBatch>();
  for (const r of punches) {
    const b = byId.get(r.employee_id) ?? byId.set(r.employee_id, { employeeId: r.employee_id, name: r.full_name, punches: [] }).get(r.employee_id)!;
    b.punches.push(r);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Filename-safe ASCII slug of a person's name ("José Ñúñez" → "Jose-Nunez").
export function fileSlug(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
