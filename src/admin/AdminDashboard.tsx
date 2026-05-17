// src/admin/AdminDashboard.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatTime, formatDate, madridTodayRange } from '../lib/time';
import { useTranslation } from '../i18n/LanguageContext';
import { LanguagePicker } from '../components/LanguagePicker';
import { LogoutButton } from '../components/LogoutButton';
import type { EffectivePunch, Employee } from '../lib/types';

interface Row extends EffectivePunch {
  employee: Pick<Employee, 'full_name' | 'email'>;
  punch: { latitude: number | null; longitude: number | null; accuracy_m: number | null } | null;
}

interface OfficeCoords { latitude: number; longitude: number }
interface EmployeeOption { id: string; full_name: string }

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

  async function load() {
    const { start, end } = madridTodayRange();
    const { data } = await supabase
      .from('effective_punches')
      .select(`
        *,
        employee:employees!effective_punches_employee_id_fkey(full_name, email),
        punch:punches!effective_punches_source_punch_id_fkey(latitude, longitude, accuracy_m)
      `)
      .gte('effective_time', start)
      .lt('effective_time', end)
      .order('effective_time', { ascending: false });
    setRows((data as unknown as Row[]) ?? []);
  }

  useEffect(() => {
    supabase.from('office_locations').select('latitude, longitude').eq('active', true)
      .then(({ data }) => {
        setOffices(((data ?? []) as { latitude: number; longitude: number }[])
          .map(o => ({ latitude: Number(o.latitude), longitude: Number(o.longitude) })));
      });

    supabase.from('employees').select('id, full_name').eq('active', true).order('full_name')
      .then(({ data }) => setEmployees((data as EmployeeOption[]) ?? []));

    load();
    const ch = supabase.channel('punches')
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'effective_punches' },
          () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const visibleRows = filterEmployeeId === 'all'
    ? rows
    : rows.filter(r => r.employee_id === filterEmployeeId);

  return (
    <div className="min-h-full max-w-4xl mx-auto px-4 py-6 space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('admin.todayTitle')}</h1>
          <div className="text-sm text-slate-500">{formatDate(new Date().toISOString())}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/admin/approvals" className="app-btn-ghost">{t('admin.approvalsLink')}</Link>
          <Link to="/admin/export" className="app-btn-ghost">{t('admin.exportLink')}</Link>
          <Link to="/" className="app-btn-ghost">{t('admin.employeeViewLink')}</Link>
          <LanguagePicker />
          <LogoutButton />
        </div>
      </header>

      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="emp-filter" className="text-slate-600">{t('admin.filterLabel')}</label>
        <select
          id="emp-filter"
          value={filterEmployeeId}
          onChange={e => setFilterEmployeeId(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        >
          <option value="all">{t('admin.filterAll')}</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.full_name}</option>
          ))}
        </select>
      </div>

      {visibleRows.length === 0 ? (
        <div className="app-card px-4 py-8 text-center text-slate-500 text-sm">{t('admin.noPunchesToday')}</div>
      ) : (
        <div className="app-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{t('admin.table.time')}</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{t('admin.table.person')}</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{t('admin.table.status')}</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{t('admin.table.info')}</th>
                <th className="text-center px-3 py-2.5 font-medium text-xs uppercase tracking-wider w-10">{t('admin.table.warn')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.map(r => {
                const lat = r.punch?.latitude;
                const lng = r.punch?.longitude;
                const hasGps = typeof lat === 'number' && typeof lng === 'number';
                const distM = distanceToNearestOffice(lat, lng, offices);
                const isFar = distM !== null && distM > FAR_THRESHOLD_M;
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 whitespace-nowrap font-mono tabular-nums text-slate-900">{formatTime(r.effective_time)}</td>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
