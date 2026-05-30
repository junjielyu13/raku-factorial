// src/admin/AdminDashboard.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatTime, formatDate, formatWeekday, madridDayRange, madridDayKeyOf, madridTodayKey, madridMinutesOfDay, madridWeekStartKey, madridWeekRange, addDaysKey, madridLastNDaysStart } from '../lib/time';
import { workedMsForDay, msToHm, pairShifts } from '../lib/worked';
import { missingEmployees } from '../lib/absence';
import type { ShiftPair } from '../lib/worked';
import { useTranslation } from '../i18n/LanguageContext';
import { LanguagePicker } from '../components/LanguagePicker';
import { LogoutButton } from '../components/LogoutButton';
import { PunchCorrectionModal } from '../components/PunchCorrectionModal';
import type { CorrectionTarget } from '../components/PunchCorrectionModal';
import WeekPicker from './WeekPicker';
import type { EffectivePunch, Employee } from '../lib/types';
import { OFFICE, OFFICES, type OfficeCoords } from '../lib/office';

type RangeFilter = 'day' | 'last7' | 'last30' | 'week' | 'custom';

// Contractual weekly working time (RD-ley 8/2019 schedule for this company).
// Used only in the "week" range to flag under/over the weekly target.
const WEEKLY_TARGET_HOURS = 41;
const WEEKLY_TARGET_MS = WEEKLY_TARGET_HOURS * 60 * 60 * 1000;

// Renders " / 41 小时" after a worked time, with a 📈 when over the weekly target.
function WeeklyTargetSuffix({ ms, t }: { ms: number; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const over = ms > WEEKLY_TARGET_MS;
  return (
    <span className={`ml-1 font-medium ${over ? 'text-rose-600' : 'text-emerald-600'}`}>
      {' '}{t('admin.stats.targetSuffix', { h: WEEKLY_TARGET_HOURS })}
      {over && <span title={t('admin.stats.overTarget')}> 📈</span>}
    </span>
  );
}

function daysAgoKey(days: number): string {
  return madridDayKeyOf(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

const PAGE_SIZES = [10, 50, 100] as const;
type PageSize = typeof PAGE_SIZES[number];

interface Row extends EffectivePunch {
  employee: Pick<Employee, 'full_name' | 'email'>;
  punch: { latitude: number | null; longitude: number | null; accuracy_m: number | null } | null;
}

interface EmployeeOption { id: string; full_name: string; role: 'employee' | 'admin' | 'it' }

type ModalState =
  | { mode: 'add'; date?: string; employeeId?: string; employeeName?: string; defaultEmployeeId?: string }
  | { mode: 'modify'; target: CorrectionTarget }
  | { mode: 'delete'; targets: CorrectionTarget[] }
  | { mode: 'add-missing'; employeeId: string; employeeName: string; kind: 'in' | 'out' };

type Shift = ShiftPair<Row>;

// Pair shifts independently per employee, then merge sorted newest-first.
// Pairing across employees would be wrong (e.g. one person's in matched
// with another person's out).
function pairShiftsByEmployee(rows: Row[]): Shift[] {
  const byEmp = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byEmp.has(r.employee_id)) byEmp.set(r.employee_id, []);
    byEmp.get(r.employee_id)!.push(r);
  }
  const all: Shift[] = [];
  for (const empRows of byEmp.values()) {
    all.push(...pairShifts(empRows));
  }
  all.sort((a, b) => {
    const ta = new Date((a.in ?? a.out!).effective_time).getTime();
    const tb = new Date((b.in ?? b.out!).effective_time).getTime();
    return tb - ta;
  });
  return all;
}

const FAR_THRESHOLD_M = OFFICE.radius_meters;

// Expected punch-time windows (Europe/Madrid, [from, to] minutes since midnight,
// both ends inclusive). A punch outside every window for its kind is flagged.
const hm = (h: number, m: number) => h * 60 + m;
const PUNCH_WINDOWS: Record<'in' | 'out', [number, number][]> = {
  in:  [[hm(12, 30), hm(12, 45)], [hm(19, 30), hm(19, 45)]],
  out: [[hm(16, 0), hm(17, 0)], [hm(23, 0), hm(24, 0)]],
};

function isPunchTimeNormal(kind: 'in' | 'out', iso: string): boolean {
  const mins = madridMinutesOfDay(iso);
  return PUNCH_WINDOWS[kind].some(([lo, hi]) => mins >= lo && mins <= hi);
}

// "HH:MM" for a minutes-since-midnight value.
function fmtMinutes(m: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// "12:30–12:45 / 19:30–19:45" for a punch kind's windows.
function describeWindows(kind: 'in' | 'out'): string {
  return PUNCH_WINDOWS[kind].map(([lo, hi]) => `${fmtMinutes(lo)}–${fmtMinutes(hi)}`).join(' / ');
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function distanceToNearestOffice(
  lat: number | null | undefined,
  lng: number | null | undefined,
  offices: OfficeCoords[],
): number | null {
  if (typeof lat !== 'number' || typeof lng !== 'number' || offices.length === 0) return null;
  return Math.min(...offices.map(o => haversineMeters(lat, lng, o.latitude, o.longitude)));
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

function targetOf(p: Row): CorrectionTarget {
  return {
    effective_id: p.id,
    employee_name: p.employee.full_name,
    kind: p.kind,
    effective_time: p.effective_time,
  };
}

// Input-styled time box that opens the modify modal when clicked.
function TimeBox({
  p,
  onModify,
}: {
  p: Row;
  onModify: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onModify}
      className="inline-flex items-center px-3 py-1.5 rounded-md bg-white ring-1 ring-slate-200 font-mono tabular-nums text-slate-900 text-sm hover:bg-slate-50 hover:ring-emerald-400 transition"
      title={p.source_request_id ? '✎' : undefined}
    >
      {formatTime(p.effective_time)}
      {p.source_request_id && <span className="ml-1.5 text-xs text-emerald-600">✎</span>}
    </button>
  );
}

function LocationPill({
  p,
  offices,
  t,
}: {
  p: Row;
  offices: OfficeCoords[];
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const lat = p.punch?.latitude;
  const lng = p.punch?.longitude;
  const hasGps = typeof lat === 'number' && typeof lng === 'number';
  if (!hasGps) {
    return <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-xs text-slate-500">{t('admin.noGps')}</span>;
  }
  const distM = distanceToNearestOffice(lat, lng, offices);
  const isFar = distM !== null && distM > FAR_THRESHOLD_M;
  // Location within the office radius is normal — no pill needed.
  if (distM !== null && !isFar) return null;
  return (
    <a
      href={`https://www.google.com/maps?q=${lat},${lng}`}
      target="_blank" rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs hover:opacity-80 transition ${isFar ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}
    >
      📍 {distM !== null ? t('admin.distanceFromOffice', { distance: formatDistance(distM) }) : `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
    </a>
  );
}

// Amber pill shown when a punch falls outside its expected time windows.
function TimeWarnPill({
  p,
  t,
}: {
  p: Row;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  if (isPunchTimeNormal(p.kind, p.effective_time)) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 text-amber-800 text-xs">
      ⏰ {t(p.kind === 'in' ? 'admin.abnormalTimeIn' : 'admin.abnormalTimeOut')}
    </span>
  );
}

// Which warnings a punch has (time-abnormal + location). Used to summarise the
// punch with one icon per issue before the row is expanded.
function punchWarnings(p: Row, offices: OfficeCoords[]): { timeBad: boolean; locBad: boolean } {
  const timeBad = !isPunchTimeNormal(p.kind, p.effective_time);
  const lat = p.punch?.latitude;
  const lng = p.punch?.longitude;
  const hasGps = typeof lat === 'number' && typeof lng === 'number';
  const distM = distanceToNearestOffice(lat, lng, offices);
  const locBad = !hasGps || (distM !== null && distM > FAR_THRESHOLD_M);
  return { timeBad, locBad };
}

// Warning summary for one punch: the relevant issue icons (⏰ time, 📍 location)
// shown side by side so the problem is visible without expanding. Clicking
// expands them into full-text pills.
function PunchBadges({
  p,
  offices,
  t,
}: {
  p: Row;
  offices: OfficeCoords[];
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [open, setOpen] = useState(false);
  const { timeBad, locBad } = punchWarnings(p, offices);
  if (!timeBad && !locBad) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title={t(open ? 'admin.warningsCollapse' : 'admin.warningsExpand')}
        aria-label={t(open ? 'admin.warningsCollapse' : 'admin.warningsExpand')}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition ${
          open ? 'bg-amber-200 text-amber-900' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
        }`}
      >
        {timeBad && <span aria-hidden="true">⏰</span>}
        {locBad && <span aria-hidden="true">📍</span>}
      </button>
      {open && (
        <>
          <TimeWarnPill p={p} t={t} />
          <LocationPill p={p} offices={offices} t={t} />
        </>
      )}
    </div>
  );
}

// Per-day absence badge: roster members who didn't punch that day. Collapsed
// behind a single 🚫 N icon; clicking expands the list of names.
function AbsenceWarn({
  names,
  t,
}: {
  names: string[];
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [open, setOpen] = useState(false);
  if (names.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title={open ? t('admin.absentCollapse') : t('admin.absentExpand', { count: names.length })}
        aria-label={open ? t('admin.absentCollapse') : t('admin.absentExpand', { count: names.length })}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition ${
          open ? 'bg-amber-200 text-amber-900' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
        }`}
      >
        🚫 {names.length}
      </button>
      {open && names.map(n => (
        <span
          key={n}
          className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800"
        >
          {n}
        </span>
      ))}
    </div>
  );
}

// Read-only modal describing the punch time + location rules.
function RulesModal({
  t,
  onClose,
}: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <div className="app-card w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900">{t('admin.rules.title')}</h2>

        <div className="space-y-1.5">
          <div className="text-sm font-medium text-slate-700">{t('admin.rules.timeTitle')}</div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 space-y-1">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">{t('admin.rules.inLabel')}</span>
              <span className="font-mono tabular-nums">{describeWindows('in')}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">{t('admin.rules.outLabel')}</span>
              <span className="font-mono tabular-nums">{describeWindows('out')}</span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-sm font-medium text-slate-700">{t('admin.rules.locationTitle')}</div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            📍 {t('admin.rules.locationDesc', { distance: formatDistance(FAR_THRESHOLD_M) })}
          </div>
        </div>

        <div className="flex">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-white ring-1 ring-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition"
          >
            {t('admin.rules.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const offices = OFFICES;
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('all');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('week');
  const [selectedDate, setSelectedDate] = useState<string>(madridTodayKey());
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(() => madridWeekStartKey(madridTodayKey()));
  const [customStart, setCustomStart] = useState<string>(() => daysAgoKey(7));
  const [customEnd, setCustomEnd] = useState<string>(madridTodayKey());
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);

  // Reset to first page when filter inputs or page size change.
  useEffect(() => {
    setPage(0);
  }, [rangeFilter, selectedDate, selectedWeekStart, customStart, customEnd, filterEmployeeId, pageSize]);

  useEffect(() => {
    supabase.from('employees').select('id, full_name, role').eq('active', true).order('full_name')
      .then(({ data }) => setEmployees((data as EmployeeOption[]) ?? []));
  }, []);

  // Pending edit-request count for the Approvals badge. Live via realtime so
  // the badge updates as employees submit and admins approve/reject.
  useEffect(() => {
    async function loadCount() {
      const { count } = await supabase
        .from('punch_edit_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingApprovals(count ?? 0);
    }
    loadCount();
    const ch = supabase.channel('punch-edit-requests-pending-count')
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'punch_edit_requests' },
          () => loadCount())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchPunches = useCallback(async () => {
    let q = supabase
      .from('effective_punches')
      .select(`
        *,
        employee:employees!effective_punches_employee_id_fkey(full_name, email),
        punch:punches!effective_punches_source_punch_id_fkey(latitude, longitude, accuracy_m)
      `)
      .is('superseded_at', null);

    if (rangeFilter === 'day') {
      const { start, end } = madridDayRange(selectedDate);
      q = q.gte('effective_time', start).lt('effective_time', end);
    } else if (rangeFilter === 'week') {
      const { start, end } = madridWeekRange(selectedWeekStart);
      q = q.gte('effective_time', start).lt('effective_time', end);
    } else if (rangeFilter === 'custom') {
      if (customStart > customEnd) { setRows([]); return; }
      const { start } = madridDayRange(customStart);
      const { end } = madridDayRange(customEnd);
      q = q.gte('effective_time', start).lt('effective_time', end);
    } else {
      const days = rangeFilter === 'last7' ? 7 : 30;
      q = q.gte('effective_time', madridLastNDaysStart(days));
    }

    const { data } = await q.order('effective_time', { ascending: false });
    setRows((data as unknown as Row[]) ?? []);
  }, [rangeFilter, selectedDate, selectedWeekStart, customStart, customEnd]);

  useEffect(() => {
    fetchPunches();
    const ch = supabase.channel(`punches-admin-${rangeFilter}-${selectedDate}-${selectedWeekStart}-${customStart}-${customEnd}`)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'effective_punches' },
          () => fetchPunches())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [rangeFilter, selectedDate, selectedWeekStart, customStart, customEnd, fetchPunches]);

  const visibleRows = filterEmployeeId === 'all'
    ? rows
    : rows.filter(r => r.employee_id === filterEmployeeId);

  const isSingleEmployee = filterEmployeeId !== 'all';
  const shifts = useMemo(
    () => pairShiftsByEmployee(visibleRows),
    [visibleRows],
  );

  const todayKey = madridTodayKey();

  // Every calendar day in the selected range (newest-first), so the list shows
  // empty days too — not just days that happen to have punches. Days after today
  // are dropped: there can be no punches there yet.
  const rangeDayKeys = useMemo(() => {
    let startKey: string;
    let endKey: string;
    if (rangeFilter === 'day') {
      return [selectedDate]; // an explicitly chosen day is shown as-is
    } else if (rangeFilter === 'week') {
      const wr = madridWeekRange(selectedWeekStart);
      startKey = wr.startKey;
      endKey = wr.endKey;
    } else if (rangeFilter === 'custom') {
      if (customStart > customEnd) return [];
      startKey = customStart;
      endKey = customEnd;
    } else {
      const days = rangeFilter === 'last7' ? 7 : 30;
      startKey = addDaysKey(todayKey, -(days - 1));
      endKey = todayKey;
    }
    if (endKey > todayKey) endKey = todayKey; // hide not-yet-reached days
    if (startKey > endKey) return [];
    const keys: string[] = [];
    for (let k = endKey; k >= startKey; k = addDaysKey(k, -1)) keys.push(k);
    return keys;
  }, [rangeFilter, selectedDate, selectedWeekStart, customStart, customEnd, todayKey]);

  // Paginate by DAY now that empty days are shown — pageSize counts days.
  const totalPages = Math.max(1, Math.ceil(rangeDayKeys.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  function shiftMs(s: Shift): number {
    if (s.in && s.out) {
      return new Date(s.out.effective_time).getTime() - new Date(s.in.effective_time).getTime();
    }
    if (s.isOpen && s.in && s.date === todayKey) {
      return Math.max(0, Date.now() - new Date(s.in.effective_time).getTime());
    }
    return 0;
  }

  // Per-day totals across all employees, computed from the FULL shift set so
  // headers don't shift as you paginate.
  const shiftDayTotalsMs = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shifts) m.set(s.date, (m.get(s.date) ?? 0) + shiftMs(s));
    return m;
  }, [shifts, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-employee per-day totals (key: `${employeeId}|${date}`).
  const shiftEmpDayTotalsMs = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shifts) {
      const empId = (s.in ?? s.out!).employee_id;
      const k = `${empId}|${s.date}`;
      m.set(k, (m.get(k) ?? 0) + shiftMs(s));
    }
    return m;
  }, [shifts, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Index all shifts by day → employee (full set, not paginated) so any day on
  // the current page can be populated.
  const shiftsByDay = useMemo(() => {
    const days = new Map<string, Map<string, { name: string; shifts: Shift[] }>>();
    for (const s of shifts) {
      const anchor = s.in ?? s.out!;
      const empId = anchor.employee_id;
      if (!days.has(s.date)) days.set(s.date, new Map());
      const empMap = days.get(s.date)!;
      if (!empMap.has(empId)) empMap.set(empId, { name: anchor.employee.full_name, shifts: [] });
      empMap.get(empId)!.shifts.push(s);
    }
    return days;
  }, [shifts]);

  // One entry per day on the current page — empty days included. Each entry's
  // employees are sorted by name; days with no punches get an empty list.
  const pagedShiftsGrouped = useMemo(() => {
    return rangeDayKeys.slice(safePage * pageSize, (safePage + 1) * pageSize).map(date => {
      const empMap = shiftsByDay.get(date);
      const employees = empMap
        ? Array.from(empMap.entries())
            .map(([empId, v]) => ({ empId, name: v.name, shifts: v.shifts }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [];
      return { date, employees };
    });
  }, [rangeDayKeys, safePage, pageSize, shiftsByDay]);

  // Employees expected to clock in: everyone active except IT (who holds admin
  // rights but doesn't punch). Used to flag per-day absences.
  const absenceRoster = useMemo(
    () => employees.filter(e => e.role !== 'it').map(e => ({ id: e.id, full_name: e.full_name })),
    [employees],
  );

  // Per-day set of employee ids that punched at least once. Built from the full
  // fetched rows (not paginated) so a day split across pages isn't misread.
  const presentByDay = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of rows) {
      const dk = madridDayKeyOf(r.effective_time);
      if (!m.has(dk)) m.set(dk, new Set());
      m.get(dk)!.add(r.employee_id);
    }
    return m;
  }, [rows]);

  const stats = useMemo(() => {
    const todayKey = madridTodayKey();
    const byEmployee = new Map<string, { name: string; rows: Row[] }>();
    for (const r of visibleRows) {
      if (!byEmployee.has(r.employee_id)) {
        byEmployee.set(r.employee_id, { name: r.employee.full_name, rows: [] });
      }
      byEmployee.get(r.employee_id)!.rows.push(r);
    }
    const perEmployee = Array.from(byEmployee.entries()).map(([id, { name, rows: empRows }]) => {
      const byDay = new Map<string, Row[]>();
      for (const r of empRows) {
        const dk = madridDayKeyOf(r.effective_time);
        if (!byDay.has(dk)) byDay.set(dk, []);
        byDay.get(dk)!.push(r);
      }
      let ms = 0;
      for (const [dk, items] of byDay) {
        ms += workedMsForDay(items, dk === todayKey ? Date.now() : null);
      }
      return { id, name, ms };
    });
    perEmployee.sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name));
    const grandMs = perEmployee.reduce((a, b) => a + b.ms, 0);
    return { perEmployee, grand: msToHm(grandMs), grandMs };
  }, [visibleRows]);

  // Week-picker derived values (cheap; computed each render).
  const currentWeekStart = madridWeekStartKey(todayKey);
  const weekRange = madridWeekRange(selectedWeekStart);
  const weekLabel = `${formatDate(`${weekRange.startKey}T12:00:00Z`)} – ${formatDate(`${weekRange.endKey}T12:00:00Z`)}`;

  return (
    <div className="min-h-full max-w-4xl mx-auto px-4 py-6 space-y-5">
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('admin.todayTitle')}</h1>
            <div className="text-sm text-slate-500">
              {rangeFilter === 'day'
                ? formatDate(new Date(`${selectedDate}T12:00:00Z`).toISOString())
                : rangeFilter === 'week'
                  ? weekLabel
                  : rangeFilter === 'custom'
                    ? `${formatDate(new Date(`${customStart}T12:00:00Z`).toISOString())} – ${formatDate(new Date(`${customEnd}T12:00:00Z`).toISOString())}`
                    : t(`admin.range.${rangeFilter}`)}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <LanguagePicker />
            <LogoutButton />
          </div>
        </div>
        <nav className="flex items-center justify-between gap-2 flex-wrap border-t border-slate-200 pt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/admin/approvals" className="app-btn-ghost relative">
              {t('admin.approvalsLink')}
              {pendingApprovals > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none ring-2 ring-white"
                  aria-label={t('admin.approvals.pendingBadge', { count: pendingApprovals })}
                >
                  {pendingApprovals}
                </span>
              )}
            </Link>
            <Link to="/admin/export" className="app-btn-ghost">{t('admin.exportLink')}</Link>
            <Link to="/admin/corrections" className="app-btn-ghost">{t('admin.corrections.button')}</Link>
            <button type="button" onClick={() => setShowRules(true)} className="app-btn-ghost">
              {t('admin.rules.button')}
            </button>
          </div>
          <Link to="/" className="text-sm text-emerald-700 hover:underline">
            {t('admin.employeeViewLink')} →
          </Link>
        </nav>
      </header>

      <div className="flex items-center gap-3 flex-wrap text-sm">
        <label className="flex items-center gap-2">
          <span className="text-slate-600">{t('admin.rangeLabel')}</span>
          <select
            value={rangeFilter}
            onChange={e => setRangeFilter(e.target.value as RangeFilter)}
            className="px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="week">{t('admin.range.week')}</option>
            <option value="last7">{t('admin.range.last7')}</option>
            <option value="last30">{t('admin.range.last30')}</option>
            <option value="day">{t('admin.range.day')}</option>
            <option value="custom">{t('admin.range.custom')}</option>
          </select>
        </label>
        {rangeFilter === 'day' && (
          <label className="flex items-center gap-2">
            <span className="text-slate-600">{t('admin.dateLabel')}</span>
            <input
              type="date"
              value={selectedDate}
              max={madridTodayKey()}
              onChange={e => {
                const v = e.target.value;
                if (v && v > madridTodayKey()) return;
                if (v) setSelectedDate(v);
              }}
              className="px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </label>
        )}
        {rangeFilter === 'week' && (
          <WeekPicker
            weekStart={selectedWeekStart}
            currentWeekStart={currentWeekStart}
            onChange={setSelectedWeekStart}
            t={t}
          />
        )}
        {rangeFilter === 'custom' && (
          <>
            <label className="flex items-center gap-2">
              <span className="text-slate-600">{t('admin.fromLabel')}</span>
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={e => { if (e.target.value) setCustomStart(e.target.value); }}
                className="px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-slate-600">{t('admin.toLabel')}</span>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                max={madridTodayKey()}
                onChange={e => {
                  const v = e.target.value;
                  if (!v) return;
                  if (v > madridTodayKey()) return;
                  setCustomEnd(v);
                }}
                className="px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
          </>
        )}
        <label className="flex items-center gap-2">
          <span className="text-slate-600">{t('admin.filterLabel')}</span>
          <select
            value={filterEmployeeId}
            onChange={e => setFilterEmployeeId(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="all">{t('admin.filterAll')}</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.full_name}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setModal({ mode: 'add' })} className="app-btn-ghost">
          {t('admin.correct.addPunch')}
        </button>
      </div>

      {stats.perEmployee.length > 0 && (
        <div className="app-card p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('admin.stats.title')}</h2>
            <span className="text-sm font-semibold text-slate-900 tabular-nums">
              {t('admin.stats.total', { h: stats.grand.h, m: stats.grand.m })}
              {/* The grand total only maps to a single 41h target when one
                  employee is filtered; otherwise it sums several people. */}
              {rangeFilter === 'week' && filterEmployeeId !== 'all' && (
                <WeeklyTargetSuffix ms={stats.grandMs} t={t} />
              )}
            </span>
          </div>
          <ul className="divide-y divide-slate-100">
            {stats.perEmployee.map(s => {
              const hm = msToHm(s.ms);
              return (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <span className="text-sm text-slate-700">{s.name}</span>
                  <span className="text-sm font-mono tabular-nums text-slate-900">
                    {t('admin.stats.hours', { h: hm.h, m: hm.m })}
                    {rangeFilter === 'week' && <WeeklyTargetSuffix ms={s.ms} t={t} />}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(() => {
        if (rangeDayKeys.length === 0) {
          return (
            <div className="app-card px-4 py-8 text-center text-slate-500 text-sm">
              {t('admin.noPunchesRange')}
            </div>
          );
        }
        const paginationContent = (
          <>
            <label className="flex items-center gap-2">
              <span className="text-slate-600">{t('common.pagination.perPage')}</span>
              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value) as PageSize)}
                className="px-2 py-1 rounded-md bg-white ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {PAGE_SIZES.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={safePage <= 0}
                className="px-3 py-1 rounded-md ring-1 ring-slate-300 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                {t('common.pagination.prev')}
              </button>
              <span className="text-xs text-slate-500 tabular-nums min-w-max">
                {t('common.pagination.pageOf', { page: safePage + 1, total: totalPages })}
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="px-3 py-1 rounded-md ring-1 ring-slate-300 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                {t('common.pagination.next')}
              </button>
            </div>
          </>
        );

        const renderShiftRow = (s: Shift, key: string) => {
          const rowTargets: CorrectionTarget[] = [
            ...(s.in ? [targetOf(s.in)] : []),
            ...(s.out ? [targetOf(s.out)] : []),
          ];
          return (
            <li key={key} className="px-4 py-3 flex items-start justify-between gap-2">
              <div className="grid grid-cols-[auto_auto_auto] gap-x-2 gap-y-1.5 items-start w-fit max-w-full">
                {s.in ? (
                  <TimeBox p={s.in} onModify={() => setModal({ mode: 'modify', target: targetOf(s.in!) })} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setModal({ mode: 'add-missing', kind: 'in', employeeId: s.out!.employee_id, employeeName: s.out!.employee.full_name })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200 transition"
                  >
                    ❓ {t('admin.shifts.strayOut')}
                  </button>
                )}
                <span className="text-slate-400 self-center px-1">–</span>
                {s.out ? (
                  <TimeBox p={s.out} onModify={() => setModal({ mode: 'modify', target: targetOf(s.out!) })} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setModal({ mode: 'add-missing', kind: 'out', employeeId: s.in!.employee_id, employeeName: s.in!.employee.full_name })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200 transition"
                  >
                    ❓ {t('admin.shifts.openShift')}
                  </button>
                )}
                <div className="justify-self-start">
                  {s.in && <PunchBadges p={s.in} offices={offices} t={t} />}
                </div>
                <span />
                <div className="justify-self-start">
                  {s.out && <PunchBadges p={s.out} offices={offices} t={t} />}
                </div>
              </div>
              {rowTargets.length > 0 && (
                <button
                  type="button"
                  onClick={() => setModal({ mode: 'delete', targets: rowTargets })}
                  className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                  title={t('admin.correct.delete')}
                  aria-label={t('admin.correct.delete')}
                >
                  ✕
                </button>
              )}
            </li>
          );
        };

        return (
          <div className="space-y-3">
            {pagedShiftsGrouped.map(({ date, employees: dayEmployees }) => {
              // Derive the header date from the day key itself (not a punch) so
              // empty days render too. Noon UTC is the same Madrid calendar day.
              const dayIso = `${date}T12:00:00Z`;
              const dayHm = msToHm(shiftDayTotalsMs.get(date) ?? 0);
              // Absences only make sense across the whole roster, not when
              // filtered to one person.
              const absent = isSingleEmployee
                ? []
                : missingEmployees(absenceRoster, presentByDay.get(date) ?? new Set());
              const absentNames = absent.map(m => m.full_name);
              return (
                <section key={date} className="app-card overflow-hidden">
                  <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/60">
                    <div className="flex flex-wrap items-center gap-1 text-sm font-semibold text-slate-900">
                      <span>{formatDate(dayIso)}</span>
                      <span className="ml-1 font-normal text-slate-500">{formatWeekday(dayIso)}</span>
                      <button
                        type="button"
                        onClick={() => setModal({
                          mode: 'add',
                          date,
                          employeeId: isSingleEmployee ? filterEmployeeId : undefined,
                          employeeName: isSingleEmployee ? employees.find(e => e.id === filterEmployeeId)?.full_name : undefined,
                          // Pre-select the (first) absent employee so the admin
                          // can fill their missing punch in one click; still changeable.
                          defaultEmployeeId: absent[0]?.id,
                        })}
                        className="ml-1 h-6 w-6 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
                        title={t('admin.correct.addForDay')}
                        aria-label={t('admin.correct.addForDay')}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                      <AbsenceWarn names={absentNames} t={t} />
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-slate-700">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-slate-500" aria-hidden="true">
                        <circle cx="12" cy="13" r="8" />
                        <path d="M12 9v4l2 2" />
                        <path d="M9 2h6" />
                      </svg>
                      <span className="font-mono tabular-nums">{t('admin.stats.hours', { h: dayHm.h, m: dayHm.m })}</span>
                    </div>
                  </header>
                  {dayEmployees.map(({ empId, name, shifts: empShifts }, empIdx) => {
                    const empHm = msToHm(shiftEmpDayTotalsMs.get(`${empId}|${date}`) ?? 0);
                    return (
                      <div key={empId} className={empIdx > 0 ? 'border-t border-slate-200' : ''}>
                        {!isSingleEmployee && (
                          <div className="px-4 py-2 flex items-center justify-between gap-3 text-xs bg-slate-50/30">
                            <span className="font-medium text-slate-700">{name}</span>
                            <span className="text-slate-500 font-mono tabular-nums">{t('admin.stats.hours', { h: empHm.h, m: empHm.m })}</span>
                          </div>
                        )}
                        <ul className="divide-y divide-slate-100">
                          {empShifts.map((s, idx) => {
                            const rowAnchor = s.in ?? s.out!;
                            return renderShiftRow(s, `${rowAnchor.id}-${idx}`);
                          })}
                        </ul>
                      </div>
                    );
                  })}
                  {dayEmployees.length === 0 && (
                    <div className="px-4 py-3 text-sm text-slate-400">{t('admin.dayNoPunches')}</div>
                  )}
                </section>
              );
            })}
            <div className="app-card px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-sm">
              {paginationContent}
            </div>
          </div>
        );
      })()}

      {modal && (modal.mode === 'add' ? (
        <PunchCorrectionModal
          mode="add"
          employees={employees}
          lockedEmployeeId={modal.employeeId}
          lockedEmployeeName={modal.employeeName}
          defaultEmployeeId={modal.defaultEmployeeId}
          defaultDate={modal.date}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); fetchPunches(); }}
        />
      ) : modal.mode === 'modify' ? (
        <PunchCorrectionModal
          mode="modify"
          target={modal.target}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); fetchPunches(); }}
        />
      ) : modal.mode === 'add-missing' ? (
        <PunchCorrectionModal
          mode="add-missing"
          employeeId={modal.employeeId}
          employeeName={modal.employeeName}
          kind={modal.kind}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); fetchPunches(); }}
        />
      ) : (
        <PunchCorrectionModal
          mode="delete"
          targets={modal.targets}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); fetchPunches(); }}
        />
      ))}

      {showRules && <RulesModal t={t} onClose={() => setShowRules(false)} />}
    </div>
  );
}
