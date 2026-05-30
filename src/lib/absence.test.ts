import { describe, it, expect } from 'vitest';
import { missingEmployees, type RosterMember } from './absence';

const roster: RosterMember[] = [
  { id: 'jose', full_name: 'Jose' },
  { id: 'ricardo', full_name: 'Ricardo' },
  { id: 'wu', full_name: 'Wu Rongjiao' },
  { id: 'liu', full_name: 'Liu Junliang' },
];

describe('missingEmployees', () => {
  it('returns empty when everyone punched', () => {
    const present = new Set(['jose', 'ricardo', 'wu', 'liu']);
    expect(missingEmployees(roster, present)).toEqual([]);
  });

  it('lists roster members with no punch', () => {
    const present = new Set(['jose', 'ricardo']);
    expect(missingEmployees(roster, present).map(m => m.id)).toEqual(['liu', 'wu']);
  });

  it('treats a clock-in with no clock-out as present (any punch counts)', () => {
    // Caller derives presentIds from rows; a single clock-in still marks present.
    const present = new Set(['jose']);
    expect(missingEmployees(roster, present).map(m => m.id)).not.toContain('jose');
  });

  it('ignores ids not in the roster (e.g. an IT user excluded upstream)', () => {
    const present = new Set(['jose', 'ricardo', 'wu', 'liu', 'junjie-it']);
    expect(missingEmployees(roster, present)).toEqual([]);
  });

  it('sorts the result by name', () => {
    const present = new Set<string>([]);
    expect(missingEmployees(roster, present).map(m => m.full_name)).toEqual([
      'Jose',
      'Liu Junliang',
      'Ricardo',
      'Wu Rongjiao',
    ]);
  });
});
