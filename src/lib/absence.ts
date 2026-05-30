// Attendance-problem detection for the admin punch-records dashboard.
//
// The "roster" is the set of people expected to clock in on a working day.
// IT staff (role 'it') hold admin privileges but are NOT expected to punch,
// so they are excluded from the roster by the caller.
//
// A roster member's day is flagged when it is incomplete in either sense:
//   - no punch at all that day (absent), or
//   - present but with an unpaired shift (clocked in without out, or vice
//     versa) — the record is missing a punch.

export interface RosterMember {
  id: string;
  full_name: string;
}

// Roster members whose attendance that day is incomplete. presentIds = ids with
// ≥1 punch; incompleteIds = ids with ≥1 unpaired shift. Sorted by name for
// stable rendering.
export function attendanceProblems(
  roster: RosterMember[],
  presentIds: Set<string>,
  incompleteIds: Set<string>,
): RosterMember[] {
  return roster
    .filter(m => !presentIds.has(m.id) || incompleteIds.has(m.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}
