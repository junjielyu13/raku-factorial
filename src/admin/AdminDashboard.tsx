// src/admin/AdminDashboard.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatTime, formatDate, madridDayRange, madridDayKeyOf, madridTodayKey } from '../lib/time';
import { workedMsForDay, msToHm } from '../lib/worked';
import { useTranslation } from '../i18n/LanguageContext';
import { LanguagePicker } from '../components/LanguagePicker';
import { LogoutButton } from '../components/LogoutButton';
import { PunchCorrectionModal } from '../components/PunchCorrectionModal';
import type { CorrectionTarget } from '../components/PunchCorrectionModal';
import type { EffectivePunch, Employee } from '../lib/types';

type RangeFilter = 'day' | 'last7' | 'last30';

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

export function AdminDashboard() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [offices, setOffices] = useState<OfficeCoords[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('all');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('day');
  const [selectedDate, setSelectedDate] = useState<string>(madridTodayKey());
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState<ModalState | null>(null);

  // Reset to first page when filter inputs or page size change.
  useEffect(() => { setPage(0); }, [rangeFilter, selectedDate, filterEmployeeId, pageSize]);

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
    } else {
      const days = rangeFilter === 'last7' ? 7 : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      q = q.gte('effective_time', since);
    }

    const { data } = await q.order('effective_time', { ascending: false });
    setRows((data as unknown as Row[]) ?? []);
  }, [rangeFilter, selectedDate]);

  useEffect(() => {
    fetchPunches();
    const ch = supabase.channel(`punches-admin-${rangeFilter}-${selectedDate}`)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'effective_punches' },
          () => fetchPunches())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [rangeFilter, selectedDate, fetchPunches]);

  const visibleRows = filterEmployeeId === 'all'
    ? rows
    : rows.filter(r => r.employee_id === filterEmployeeId);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pagedRows = visibleRows.slice(safePage * pageSize, (safePage + 1) * pageSize);

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
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('admin.todayTitle')}</h1>
          <div className="text-sm text-slate-500">
            {rangeFilter === 'day'
              ? formatDate(new Date(`${selectedDate}T12:00:00Z`).toISOString())
              : t(`admin.range.${rangeFilter}`)}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/admin/approvals" className="app-btn-ghost">{t('admin.approvalsLink')}</Link>
          <Link to="/admin/export" className="app-btn-ghost">{t('admin.exportLink')}</Link>
          <Link to="/" className="app-btn-ghost">{t('admin.employeeViewLink')}</Link>
          <LanguagePicker />
          <LogoutButton />
        </div>
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

      {visibleRows.length === 0 ? (
        <div className="app-card px-4 py-8 text-center text-slate-500 text-sm">
          {rangeFilter === 'day' ? t('admin.noPunchesToday') : t('admin.noPunchesRange')}
        </div>
      ) : rangeFilter !== 'day' ? null : (
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
                      {formatTime(r.effective_time)}
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
          </div>
        </div>
      )}

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
