// Absence detection for the admin punch-records dashboard.
//
// The "roster" is the set of people expected to clock in on a working day.
// IT staff (role 'it') hold admin privileges but are NOT expected to punch,
// so they are excluded from the roster by the caller. Given a roster and the
// set of employee ids that actually have at least one punch on a day, this
// returns who is missing.

export interface RosterMember {
  id: string;
  full_name: string;
}

// Returns roster members with no punch on the day (presentIds = ids that
// punched at least once), sorted by name for stable rendering.
export function missingEmployees(
  roster: RosterMember[],
  presentIds: Set<string>,
): RosterMember[] {
  return roster
    .filter(m => !presentIds.has(m.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}
