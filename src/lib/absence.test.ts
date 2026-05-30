import { describe, it, expect } from 'vitest';
import { attendanceProblems, type RosterMember } from './absence';

const roster: RosterMember[] = [
  { id: 'jose', full_name: 'Jose' },
  { id: 'ricardo', full_name: 'Ricardo' },
  { id: 'wu', full_name: 'Wu Rongjiao' },
  { id: 'liu', full_name: 'Liu Junliang' },
];

const none = new Set<string>();

describe('attendanceProblems', () => {
  it('returns empty when everyone is present and complete', () => {
    const present = new Set(['jose', 'ricardo', 'wu', 'liu']);
    expect(attendanceProblems(roster, present, none)).toEqual([]);
  });

  it('flags roster members with no punch (absent)', () => {
    const present = new Set(['jose', 'ricardo', 'wu']);
    expect(attendanceProblems(roster, present, none).map(m => m.id)).toEqual(['liu']);
  });

  it('flags present members who have an incomplete shift', () => {
    // Wu clocked in but never out → present yet incomplete.
    const present = new Set(['jose', 'ricardo', 'wu']);
    const incomplete = new Set(['wu']);
    expect(attendanceProblems(roster, present, incomplete).map(m => m.id)).toEqual(['liu', 'wu']);
  });

  it('counts both absent and incomplete together', () => {
    const present = new Set(['jose', 'ricardo', 'wu']);
    const incomplete = new Set(['wu']);
    expect(attendanceProblems(roster, present, incomplete)).toHaveLength(2);
  });

  it('does not double-list a member who is both absent and (vacuously) incomplete', () => {
    const present = new Set(['jose', 'ricardo']);
    const incomplete = new Set(['liu']); // absent, also in incomplete set
    expect(attendanceProblems(roster, present, incomplete).map(m => m.id)).toEqual(['liu', 'wu']);
  });

  it('ignores ids not in the roster (e.g. an IT user excluded upstream)', () => {
    const present = new Set(['jose', 'ricardo', 'wu', 'liu', 'junjie-it']);
    expect(attendanceProblems(roster, present, none)).toEqual([]);
  });

  it('sorts the result by name', () => {
    expect(attendanceProblems(roster, none, none).map(m => m.full_name)).toEqual([
      'Jose',
      'Liu Junliang',
      'Ricardo',
      'Wu Rongjiao',
    ]);
  });
});
