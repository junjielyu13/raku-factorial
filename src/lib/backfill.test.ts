import { describe, it, expect } from 'vitest';
import { computeWeekBackfill, weeklySchedule, type BackfillShift } from './backfill';
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

function run(shifts: BackfillShift[], nowIso = FUTURE_NOW, startDate?: string) {
  return computeWeekBackfill({ weekDayKeys: WEEK, shifts, nowMs: new Date(nowIso).getTime(), startDate });
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
      '2026-06-05 afternoon out@23:30',
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

  it('Fri/Sat/Sun afternoon ends at 23:30; Mon/Thu at 23:00', () => {
    const outs = view(run([])).filter(v => v.includes('afternoon out'));
    expect(outs).toEqual([
      '2026-06-01 afternoon out@23:00',
      '2026-06-04 afternoon out@23:00',
      '2026-06-05 afternoon out@23:30',
      '2026-06-06 afternoon out@23:30',
      '2026-06-07 afternoon out@23:30',
    ]);
  });

  it('an empty week backfills exactly the 40h contractual schedule', () => {
    const punches = run([]);
    let ms = 0;
    for (let i = 0; i < punches.length; i += 2) {
      expect(punches[i].kind).toBe('in');
      expect(punches[i + 1].kind).toBe('out');
      ms += new Date(punches[i + 1].timeIso).getTime() - new Date(punches[i].timeIso).getTime();
    }
    expect(ms).toBe(40 * 60 * 60 * 1000);
  });

  it('skips days before the employee start date', () => {
    const days = new Set(run([], FUTURE_NOW, FRI).map(p => p.dateKey));
    expect([...days].sort()).toEqual(['2026-06-05', '2026-06-06', '2026-06-07']);
  });

  it('fills nothing when the employee starts after the week', () => {
    expect(run([], FUTURE_NOW, '2026-06-08')).toEqual([]);
  });

  it('skips company vacation days (2026-08-03 … 2026-08-24)', () => {
    const fullVacationWeek = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09'];
    expect(computeWeekBackfill({ weekDayKeys: fullVacationWeek, shifts: [], nowMs: new Date(FUTURE_NOW).getTime() + 1e11 })).toEqual([]);

    const lastWeek = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'];
    const days = new Set(computeWeekBackfill({ weekDayKeys: lastWeek, shifts: [], nowMs: new Date(FUTURE_NOW).getTime() + 1e11 }).map(p => p.dateKey));
    expect(days.has('2026-08-24')).toBe(false);
    expect(days.has('2026-08-25')).toBe(true);
  });
});

describe('weeklySchedule', () => {
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  it('lists Mon→Sun with the contract shifts', () => {
    expect(weeklySchedule().map(d => [d.weekday, d.shifts.map(s => `${fmt(s.in)}-${fmt(s.out)}`).join(' ')])).toEqual([
      [1, '12:30-16:00 19:30-23:00'],
      [2, '12:30-16:00'],
      [3, ''],
      [4, '12:30-16:00 19:30-23:00'],
      [5, '12:30-16:00 19:30-23:30'],
      [6, '12:30-16:00 19:30-23:30'],
      [0, '12:30-16:00 19:30-23:30'],
    ]);
  });

  it('totals 40h', () => {
    const min = weeklySchedule().flatMap(d => d.shifts).reduce((a, s) => a + s.out - s.in, 0);
    expect(min).toBe(40 * 60);
  });
});
