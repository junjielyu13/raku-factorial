// Computes the punches an admin's one-click "backfill week" would add for a
// single employee, from the company's fixed schedule. Pure + deterministic so
// it can be unit-tested and reused by the preview modal and the submit call.
//
// Rules (see docs / rules card):
//   • Two shifts per workday: morning 12:30→16:00, afternoon 19:30→23:00.
//   • Rest periods are skipped: Tuesday afternoon, and all of Wednesday.
//   • Fill what's MISSING, never overwrite a real punch:
//       - half-day with no punch at all        → add both in + out
//       - half-day clocked in but never out     → add the out only
//       - half-day already in+out (even if the times look abnormal) → nothing
//   • Never create an open shift: a full shift is only added once its out time
//     is in the past; an out-only fill is only added once that out is past.
import { madridMinutesOfDay, madridWallTimeToIso, weekdayOfKey } from './time';

// Schedule boundary times (Madrid minutes since midnight). Kept in sync with the
// punch-time windows shown on the admin rules card (lower bound of each window).
const SCHEDULE = {
  morning:   { in: 12 * 60 + 30, out: 16 * 60 },      // 12:30 / 16:00
  afternoon: { in: 19 * 60 + 30, out: 23 * 60 },      // 19:30 / 23:00
} as const;

// An in-time before this is a morning shift; at/after it, an afternoon shift.
// Safely between the morning out-window end (17:00) and afternoon in (19:30).
const SHIFT_SPLIT_MIN = 18 * 60;

const TUESDAY = 2;
const WEDNESDAY = 3;

type ShiftName = 'morning' | 'afternoon';

// Minimal shape of an existing paired shift (subset of worked.ts ShiftPair).
export interface BackfillShift {
  date: string;                                            // Madrid YYYY-MM-DD
  in: { effective_time: string } | null;
  out: { effective_time: string } | null;
}

export interface BackfillPunch {
  dateKey: string;
  shift: ShiftName;
  kind: 'in' | 'out';
  timeIso: string;
}

// Which scheduled shifts a given weekday expects (after rest-day removal).
function scheduledShifts(weekday: number): ShiftName[] {
  if (weekday === WEDNESDAY) return [];
  if (weekday === TUESDAY) return ['morning'];   // afternoon is a rest period
  return ['morning', 'afternoon'];
}

// Classify an existing shift to a half-day by its anchoring punch's time.
function classify(s: BackfillShift): ShiftName {
  const anchor = (s.in ?? s.out)!.effective_time;
  return madridMinutesOfDay(anchor) < SHIFT_SPLIT_MIN ? 'morning' : 'afternoon';
}

export function computeWeekBackfill(args: {
  weekDayKeys: string[];
  shifts: BackfillShift[];
  nowMs: number;
}): BackfillPunch[] {
  const { weekDayKeys, shifts, nowMs } = args;
  const result: BackfillPunch[] = [];

  for (const dateKey of weekDayKeys) {
    const wanted = scheduledShifts(weekdayOfKey(dateKey));
    if (wanted.length === 0) continue;

    // Existing shifts on this day, grouped by half-day. More than one in a slot
    // is treated as "covered" (leave the unusual case to manual correction).
    const bySlot = new Map<ShiftName, BackfillShift[]>();
    for (const s of shifts) {
      if (s.date !== dateKey) continue;
      const slot = classify(s);
      (bySlot.get(slot) ?? bySlot.set(slot, []).get(slot)!).push(s);
    }

    for (const name of wanted) {
      const sched = SCHEDULE[name];
      const existing = bySlot.get(name) ?? [];
      const outMs = new Date(madridWallTimeToIso(dateKey, sched.out)).getTime();

      if (existing.length === 0) {
        // Whole half-day missing → add in + out, but only once the shift is over
        // (so we never leave an open, half-backfilled shift for today).
        if (outMs > nowMs) continue;
        result.push({ dateKey, shift: name, kind: 'in', timeIso: madridWallTimeToIso(dateKey, sched.in) });
        result.push({ dateKey, shift: name, kind: 'out', timeIso: madridWallTimeToIso(dateKey, sched.out) });
        continue;
      }

      if (existing.length === 1) {
        const s = existing[0];
        // Clocked in but never out → fill just the out, once it's in the past.
        if (s.in && !s.out) {
          if (outMs > nowMs) continue;
          result.push({ dateKey, shift: name, kind: 'out', timeIso: madridWallTimeToIso(dateKey, sched.out) });
        }
        // in+out present, or a stray out: covered, add nothing.
      }
      // length > 1: covered, add nothing.
    }
  }

  // Chronological order for a readable preview.
  result.sort((a, b) => a.timeIso < b.timeIso ? -1 : a.timeIso > b.timeIso ? 1 : 0);
  return result;
}
