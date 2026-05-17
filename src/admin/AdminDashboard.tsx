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

interface EmployeeOption { id: string; full_name: string }

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
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">{t('admin.todayTitle')} — {formatDate(new Date().toISOString())}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <nav className="flex gap-3 text-sm text-blue-700 underline">
            <Link to="/admin/approvals">{t('admin.approvalsLink')}</Link>
            <Link to="/admin/export">{t('admin.exportLink')}</Link>
            <Link to="/">{t('admin.employeeViewLink')}</Link>
          </nav>
          <LanguagePicker />
          <LogoutButton />
        </div>
      </header>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-gray-600">{t('admin.filterLabel')}:</span>
        <select
          value={filterEmployeeId}
          onChange={e => setFilterEmployeeId(e.target.value)}
          className="px-2 py-1 border rounded bg-white"
        >
          <option value="all">{t('admin.filterAll')}</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.full_name}</option>
          ))}
        </select>
      </label>

      {visibleRows.length === 0 ? (
        <div className="text-gray-500">{t('admin.noPunchesToday')}</div>
      ) : (
        <div className="overflow-x-auto border rounded bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{t('admin.table.time')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('admin.table.person')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('admin.table.status')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('admin.table.info')}</th>
                <th className="text-center px-3 py-2 font-medium w-10">{t('admin.table.warn')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleRows.map(r => {
                const lat = r.punch?.latitude;
                const lng = r.punch?.longitude;
                const hasGps = typeof lat === 'number' && typeof lng === 'number';
                const distM = distanceToNearestOffice(lat, lng, offices);
                const isFar = distM !== null && distM > FAR_THRESHOLD_M;
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatTime(r.effective_time)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.employee.full_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.kind === 'in' ? t('punch.in') : t('punch.out')}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {hasGps ? (
                        <a
                          href={`https://www.google.com/maps?q=${lat},${lng}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-blue-700 hover:underline"
                        >
                          📍 {lat.toFixed(5)}, {lng.toFixed(5)}
                          {typeof r.punch?.accuracy_m === 'number' && ` · ±${Math.round(r.punch.accuracy_m)}m`}
                          {distM !== null && ` · ${t('admin.distanceFromOffice', { distance: formatDistance(distM) })}`}
                        </a>
                      ) : (
                        <span>{t('admin.noGps')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
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
