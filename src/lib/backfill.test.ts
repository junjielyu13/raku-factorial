import { describe, it, expect } from 'vitest';
import { computeWeekBackfill, type BackfillShift } from './backfill';
import { madridWallTimeToIso, madridMinutesOfDay } from './time';

// Week of Mon 2026-06-01 … Sun 2026-06-07 (matches the screenshot's week).
const WEEK = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'];
const MON = '2026-06-01', TUE = '2026-06-02', WED = '2026-06-03', THU = '2026-06-04', FRI = '2026-06-05';

// "now" far in the future so nothing is filtered as future, unless a test overrides it.
const FUTURE_NOW = madridWallTimeToIso('2026-06-30', 0);

function shift(date: string, inMin: number | null, outMin: number | null): BackfillShift {
  return {
    date,
    in: inMin === null ? null : { effective_time: madridWallTimeToIso(date, inMin) },
    out: outMin === null ? null : { effective_time: madridWallTimeToIso(date, outMin) },
  };
}

function run(shifts: BackfillShift[], nowIso = FUTURE_NOW) {
  return computeWeekBackfill({ weekDayKeys: WEEK, shifts, nowMs: new Date(nowIso).getTime() });
}

// Compact view: "date shift kind@HH:MM"
function view(punches: ReturnType<typeof run>) {
  return punches.map(p => {
    const min = madridMinutesOfDay(p.timeIso);
    const hh = String(Math.floor(min / 60)).padStart(2, '0');
    const mm = String(min % 60).padStart(2, '0');
    return `${p.dateKey} ${p.shift} ${p.kind}@${hh}:${mm}`;
  });
}

describe('computeWeekBackfill', () => {
  it('fills both shifts on an empty normal workday (Monday)', () => {
    const out = run([]);
    expect(view(out)).toContain('2026-06-01 morning in@12:30');
    expect(view(out)).toContain('2026-06-01 morning out@16:00');
    expect(view(out)).toContain('2026-06-01 afternoon in@19:30');
    expect(view(out)).toContain('2026-06-01 afternoon out@23:00');
  });

  it('Tuesday fills morning only (afternoon is a rest period)', () => {
    const tue = run([]).filter(p => p.dateKey === TUE);
    expect(view(tue)).toEqual([
      '2026-06-02 morning in@12:30',
      '2026-06-02 morning out@16:00',
    ]);
  });

  it('Wednesday fills nothing (full rest day)', () => {
    expect(run([]).filter(p => p.dateKey === WED)).toEqual([]);
  });

  it('leaves a fully-present day untouched', () => {
    // Thursday with both shifts already punched (afternoon out abnormal at 17:40 morning + full afternoon).
    const shifts = [
      shift(THU, 12 * 60 + 44, 17 * 60 + 40), // morning, abnormal out
      shift(THU, 19 * 60 + 30, 23 * 60),      // afternoon, normal
    ];
    expect(run(shifts).filter(p => p.dateKey === THU)).toEqual([]);
  });

  it('fills only the missing afternoon when morning is already present', () => {
    // Friday: morning 12:34–16:15 present, afternoon empty.
    const shifts = [shift(FRI, 12 * 60 + 34, 16 * 60 + 15)];
    expect(view(run(shifts).filter(p => p.dateKey === FRI))).toEqual([
      '2026-06-05 afternoon in@19:30',
      '2026-06-05 afternoon out@23:00',
    ]);
  });

  it('fills only the missing out when a shift was left open (clocked in, no clock out)', () => {
    // Monday morning: in at 12:40, never clocked out. Afternoon empty.
    const shifts = [shift(MON, 12 * 60 + 40, null)];
    expect(view(run(shifts).filter(p => p.dateKey === MON))).toEqual([
      '2026-06-01 morning out@16:00',
      '2026-06-01 afternoon in@19:30',
      '2026-06-01 afternoon out@23:00',
    ]);
  });

  it('skips shifts whose end time has not happened yet (no open shifts created for today)', () => {
    // "now" = Monday 14:00. Morning out (16:00) is future → skip whole morning shift;
    // afternoon (19:30/23:00) is future → skipped too.
    const out = run([], madridWallTimeToIso(MON, 14 * 60)).filter(p => p.dateKey === MON);
    expect(out).toEqual([]);
  });

  it('fills a past shift earlier the same day even when a later shift is still in the future', () => {
    // "now" = Monday 17:00. Morning (ends 16:00) is past → fill; afternoon (ends 23:00) future → skip.
    const out = run([], madridWallTimeToIso(MON, 17 * 60)).filter(p => p.dateKey === MON);
    expect(view(out)).toEqual([
      '2026-06-01 morning in@12:30',
      '2026-06-01 morning out@16:00',
    ]);
  });

  it('does not touch a day that has a stray out (out with no in)', () => {
    const shifts: BackfillShift[] = [
      { date: MON, in: null, out: { effective_time: madridWallTimeToIso(MON, 16 * 60) } },
    ];
    // morning slot is "covered" by the stray out; only the empty afternoon is filled.
    expect(view(run(shifts).filter(p => p.dateKey === MON))).toEqual([
      '2026-06-01 afternoon in@19:30',
      '2026-06-01 afternoon out@23:00',
    ]);
  });
});
