import { describe, it, expect } from 'vitest';
import { withoutRoles, splitByEmployee, fileSlug } from './exportBatch';
import type { PunchRow } from './monthlyPdf';

const p = (employee_id: string, full_name: string, effective_time: string): PunchRow =>
  ({ employee_id, full_name, email: `${employee_id}@x.es`, kind: 'in', effective_time });

const punches = [
  p('jose', 'Jose', '2026-09-01T10:30:00Z'),
  p('it', 'Junjie IT Admin', '2026-09-01T10:31:00Z'),
  p('liu', 'Liu Junliang', '2026-09-01T10:32:00Z'),
  p('jose', 'Jose', '2026-09-02T10:30:00Z'),
];
const staff = [
  { id: 'jose', role: 'employee' as const },
  { id: 'it', role: 'it' as const },
  { id: 'liu', role: 'admin' as const },
];

describe('withoutRoles', () => {
  it('drops punches of IT accounts, keeps employees and admins', () => {
    expect(withoutRoles(punches, staff, ['it']).map(r => r.employee_id)).toEqual(['jose', 'liu', 'jose']);
  });
});

describe('splitByEmployee', () => {
  it('groups punches per employee, sorted by name', () => {
    const groups = splitByEmployee(withoutRoles(punches, staff, ['it']));
    expect(groups.map(g => [g.name, g.punches.length])).toEqual([['Jose', 2], ['Liu Junliang', 1]]);
  });
});

describe('fileSlug', () => {
  it('makes a filename-safe, accent-free slug', () => {
    expect(fileSlug('Liu Junliang')).toBe('Liu-Junliang');
    expect(fileSlug('José Ñúñez / B')).toBe('Jose-Nunez-B');
  });
});
