// src/admin/AdminDashboard.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatTime, formatDate, formatDateTime, madridDayRange, madridDayKeyOf, madridTodayKey } from '../lib/time';
import { workedMsForDay, msToHm } from '../lib/worked';
import { useTranslation } from '../i18n/LanguageContext';
import { LanguagePicker } from '../components/LanguagePicker';
import { LogoutButton } from '../components/LogoutButton';
import { PunchCorrectionModal } from '../components/PunchCorrectionModal';
import type { CorrectionTarget } from '../components/PunchCorrectionModal';
import type { EffectivePunch, Employee } from '../lib/types';

type RangeFilter = 'day' | 'last7' | 'last30' | 'custom';

function daysAgoKey(days: number): string {
  return madridDayKeyOf(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

const PAGE_SIZES = [10, 50, 100] as const;
type PageSize = typeof PAGE_SIZES[number];

interface Row extends EffectivePunch {
  employee: Pick<Employee, 'full_name' | 'email'>;
  punch: { latitude: number | null; longitude: number | null; accuracy_m: number | null } | null;
}

interface OfficeCoords { latitude: number; longitude: number }
interface EmployeeOption { id: string; full_name: string }

type ModalState =
  | { mode: 'add' }
  | { mode: 'modify' | 'delete'; target: CorrectionTarget };

interface Shift {
  date: string;          // Madrid YYYY-MM-DD of the anchoring punch
  in: Row | null;
  out: Row | null;
  isOpen: boolean;       // in punch with no matching out
  isStrayOut: boolean;   // out punch with no preceding in
}

// Walk punches ascending and pair each `in` with the next `out`. A trailing
// open `in` becomes an open shift (warning); an `out` with no preceding `in`
// is recorded as a stray-out anomaly. Returned newest-first.
function pairShifts(rows: Row[]): Shift[] {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.effective_time).getTime() - new Date(b.effective_time).getTime(),
  );
  const shifts: Shift[] = [];
  let openIn: Row | null = null;
  for (const p of sorted) {
    if (p.kind === 'in') {
      if (openIn) {
        shifts.push({ date: madridDayKeyOf(openIn.effective_time), in: openIn, out: null, isOpen: true, isStrayOut: false });
      }
      openIn = p;
    } else {
      if (openIn) {
        shifts.push({ date: madridDayKeyOf(openIn.effective_time), in: openIn, out: p, isOpen: false, isStrayOut: false });
        openIn = null;
      } else {
        shifts.push({ date: madridDayKeyOf(p.effective_time), in: null, out: p, isOpen: false, isStrayOut: true });
      }
    }
  }
  if (openIn) {
    shifts.push({ date: madridDayKeyOf(openIn.effective_time), in: openIn, out: null, isOpen: true, isStrayOut: false });
  }
  return shifts.reverse();
}

const FAR_THRESHOLD_M = 2000;

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

export function AdminDashboard() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [offices, setOffices] = useState<OfficeCoords[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('all');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('day');
  const [selectedDate, setSelectedDate] = useState<string>(madridTodayKey());
  const [customStart, setCustomStart] = useState<string>(() => daysAgoKey(7));
  const [customEnd, setCustomEnd] = useState<string>(madridTodayKey());
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState<ModalState | null>(null);

  // Reset to first page when filter inputs or page size change.
  useEffect(() => {
    setPage(0);
  }, [rangeFilter, selectedDate, customStart, customEnd, filterEmployeeId, pageSize]);

  useEffect(() => {
    supabase.from('office_locations').select('latitude, longitude').eq('active', true)
      .then(({ data }) => {
        setOffices(((data ?? []) as { latitude: number; longitude: number }[])
          .map(o => ({ latitude: Number(o.latitude), longitude: Number(o.longitude) })));
      });

    supabase.from('employees').select('id, full_name').eq('active', true).order('full_name')
      .then(({ data }) => setEmployees((data as EmployeeOption[]) ?? []));
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
    } else if (rangeFilter === 'custom') {
      if (customStart > customEnd) { setRows([]); return; }
      const { start } = madridDayRange(customStart);
      const { end } = madridDayRange(customEnd);
      q = q.gte('effective_time', start).lt('effective_time', end);
    } else {
      const days = rangeFilter === 'last7' ? 7 : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      q = q.gte('effective_time', since);
    }

    const { data } = await q.order('effective_time', { ascending: false });
    setRows((data as unknown as Row[]) ?? []);
  }, [rangeFilter, selectedDate, customStart, customEnd]);

  useEffect(() => {
    fetchPunches();
    const ch = supabase.channel(`punches-admin-${rangeFilter}-${selectedDate}-${customStart}-${customEnd}`)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'effective_punches' },
          () => fetchPunches())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [rangeFilter, selectedDate, customStart, customEnd, fetchPunches]);

  const visibleRows = filterEmployeeId === 'all'
    ? rows
    : rows.filter(r => r.employee_id === filterEmployeeId);

  const isSingleEmployee = filterEmployeeId !== 'all';
  const shifts = useMemo(
    () => (isSingleEmployee ? pairShifts(visibleRows) : []),
    [isSingleEmployee, visibleRows],
  );

  const itemCount = isSingleEmployee ? shifts.length : visibleRows.length;
  const totalPages = Math.max(1, Math.ceil(itemCount / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pagedRows = visibleRows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const pagedShifts = shifts.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // Per-day totals for the shift view, computed from the FULL shift set so
  // the day header doesn't shift as you paginate.
  const todayKey = madridTodayKey();
  const shiftDayTotalsMs = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shifts) {
      let add = 0;
      if (s.in && s.out) {
        add = new Date(s.out.effective_time).getTime() - new Date(s.in.effective_time).getTime();
      } else if (s.isOpen && s.in && s.date === todayKey) {
        add = Math.max(0, Date.now() - new Date(s.in.effective_time).getTime());
      }
      m.set(s.date, (m.get(s.date) ?? 0) + add);
    }
    return m;
  }, [shifts, todayKey]);

  const pagedShiftsByDay = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of pagedShifts) {
      if (!m.has(s.date)) m.set(s.date, []);
      m.get(s.date)!.push(s);
    }
    return Array.from(m.entries());
  }, [pagedShifts]);

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
    return { perEmployee, grand: msToHm(grandMs) };
  }, [visibleRows]);

  return (
    <div className="min-h-full max-w-4xl mx-auto px-4 py-6 space-y-5">
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('admin.todayTitle')}</h1>
            <div className="text-sm text-slate-500">
              {rangeFilter === 'day'
                ? formatDate(new Date(`${selectedDate}T12:00:00Z`).toISOString())
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
            <Link to="/admin/approvals" className="app-btn-ghost">{t('admin.approvalsLink')}</Link>
            <Link to="/admin/export" className="app-btn-ghost">{t('admin.exportLink')}</Link>
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
            <option value="day">{t('admin.range.day')}</option>
            <option value="last7">{t('admin.range.last7')}</option>
            <option value="last30">{t('admin.range.last30')}</option>
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
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(() => {
        if (visibleRows.length === 0) {
          return (
            <div className="app-card px-4 py-8 text-center text-slate-500 text-sm">
              {rangeFilter === 'day' ? t('admin.noPunchesToday') : t('admin.noPunchesRange')}
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

        if (isSingleEmployee) {
          return (
            <div className="space-y-3">
              {pagedShiftsByDay.map(([dayKey, daysShifts]) => {
                const anchor = daysShifts[0].in ?? daysShifts[0].out!;
                const hm = msToHm(shiftDayTotalsMs.get(dayKey) ?? 0);
                return (
                  <section key={dayKey} className="app-card overflow-hidden">
                    <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/60">
                      <div className="text-sm font-semibold text-slate-900">{formatDate(anchor.effective_time)}</div>
                      <div className="flex items-center gap-1.5 text-sm text-slate-700">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-slate-500" aria-hidden="true">
                          <circle cx="12" cy="13" r="8" />
                          <path d="M12 9v4l2 2" />
                          <path d="M9 2h6" />
                        </svg>
                        <span className="font-mono tabular-nums">{t('admin.stats.hours', { h: hm.h, m: hm.m })}</span>
                      </div>
                    </header>
                    <ul className="divide-y divide-slate-100">
                      {daysShifts.map((s, idx) => {
                        const rowKeyAnchor = s.in ?? s.out!;
                        return (
                          <li key={`${rowKeyAnchor.id}-${idx}`} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              {s.in ? (
                                <div className="flex items-center gap-1">
                                  <TimeBox p={s.in} onModify={() => setModal({ mode: 'modify', target: targetOf(s.in!) })} />
                                  <button
                                    type="button"
                                    onClick={() => setModal({ mode: 'delete', target: targetOf(s.in!) })}
                                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                    title={`${t('admin.correct.delete')} · ${t('punch.in')}`}
                                    aria-label={`${t('admin.correct.delete')} ${t('punch.in')}`}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <span className="inline-flex items-center px-3 py-1.5 rounded-md bg-slate-50 ring-1 ring-slate-200 text-slate-400 text-sm">—</span>
                              )}
                              <span className="text-slate-400">–</span>
                              {s.out ? (
                                <div className="flex items-center gap-1">
                                  <TimeBox p={s.out} onModify={() => setModal({ mode: 'modify', target: targetOf(s.out!) })} />
                                  <button
                                    type="button"
                                    onClick={() => setModal({ mode: 'delete', target: targetOf(s.out!) })}
                                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                    title={`${t('admin.correct.delete')} · ${t('punch.out')}`}
                                    aria-label={`${t('admin.correct.delete')} ${t('punch.out')}`}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 text-sm font-medium">
                                  ⚠️ {t('admin.shifts.openShift')}
                                </span>
                              )}
                            </div>
                            <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
                              {s.in && <LocationPill p={s.in} offices={offices} t={t} />}
                              {s.out && <LocationPill p={s.out} offices={offices} t={t} />}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
              <div className="app-card px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-sm">
                {paginationContent}
              </div>
            </div>
          );
        }

        return (
          <div className="app-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{t('admin.table.time')}</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{t('admin.table.person')}</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{t('admin.table.status')}</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{t('admin.table.info')}</th>
                    <th className="text-center px-3 py-2.5 font-medium text-xs uppercase tracking-wider w-10">{t('admin.table.warn')}</th>
                    <th className="text-right px-3 py-2.5 font-medium text-xs uppercase tracking-wider">{t('admin.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRows.map(r => {
                    const lat = r.punch?.latitude;
                    const lng = r.punch?.longitude;
                    const hasGps = typeof lat === 'number' && typeof lng === 'number';
                    const distM = distanceToNearestOffice(lat, lng, offices);
                    const isFar = distM !== null && distM > FAR_THRESHOLD_M;
                    const target: CorrectionTarget = {
                      effective_id: r.id,
                      employee_name: r.employee.full_name,
                      kind: r.kind,
                      effective_time: r.effective_time,
                    };
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 whitespace-nowrap font-mono tabular-nums text-slate-900">
                          {rangeFilter === 'day' ? formatTime(r.effective_time) : formatDateTime(r.effective_time)}
                          {r.source_request_id && (
                            <span className="ml-1.5 text-xs font-sans text-emerald-600" title={t('admin.correct.correctedBadge')}>
                              ✎
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-700">{r.employee.full_name}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${r.kind === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            <span className="leading-none">{r.kind === 'in' ? '▶' : '■'}</span>
                            {r.kind === 'in' ? t('punch.in') : t('punch.out')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {hasGps ? (
                            <a
                              href={`https://www.google.com/maps?q=${lat},${lng}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-emerald-700 hover:underline"
                            >
                              📍 {lat.toFixed(5)}, {lng.toFixed(5)}
                              {typeof r.punch?.accuracy_m === 'number' && ` · ±${Math.round(r.punch.accuracy_m)}m`}
                              {distM !== null && ` · ${t('admin.distanceFromOffice', { distance: formatDistance(distM) })}`}
                            </a>
                          ) : (
                            <span className="text-slate-400">{t('admin.noGps')}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {isFar && <span title={`${Math.round(distM!)}m`}>⚠️</span>}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => setModal({ mode: 'modify', target })}
                            className="text-xs text-emerald-700 hover:underline mr-3"
                          >
                            {t('admin.correct.modify')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setModal({ mode: 'delete', target })}
                            className="text-xs text-rose-700 hover:underline"
                          >
                            {t('admin.correct.delete')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-sm">
              {paginationContent}
            </div>
          </div>
        );
      })()}

      {modal && (
        <PunchCorrectionModal
          mode={modal.mode}
          target={modal.mode === 'add' ? undefined : modal.target}
          employees={employees}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); fetchPunches(); }}
        />
      )}
    </div>
  );
}
