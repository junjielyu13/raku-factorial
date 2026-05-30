// Monthly compliance PDF — "registro de jornada" (RD-ley 8/2019).
//
// This module shapes the month's effective punches into a per-employee report
// model and assembles a pdfmake document. The body text is FIXED SPANISH on
// purpose: it is a legal record for Spanish authorities, independent of the UI
// locale. pdfmake itself is loaded lazily in `downloadMonthlyPdf` so it never
// enters the main bundle.
import { pairShifts, workedMsForDay, msToHm } from './worked';
import { COMPANY_INFO, EMPLOYEE_DNI, type CompanyInfo } from './companyInfo';

export interface PunchRow {
  employee_id: string;
  kind: 'in' | 'out';
  effective_time: string;
  email: string;
  full_name: string;
}

export interface ShiftRow {
  date: string;     // DD/MM/YY (Madrid)
  weekday: string;  // Spanish short day name
  entrada: string;  // HH:MM (Madrid) or '—'
  salida: string;   // HH:MM (Madrid) or '—'
  horas: string;    // H:MM or '—'
}

export interface EmployeeReport {
  employeeId: string;
  fullName: string;
  email: string;
  dni: string;
  rows: ShiftRow[];
  totalHoras: string;  // H:MM
  totalMs: number;     // worked milliseconds (numeric, for Excel/sorting)
}

const DASH = '—';

// --- Madrid/Spanish formatters (fixed locale & timezone, not the UI's) -------

const madridParts = (iso: string) => {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(new Date(iso));
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute') };
};

const madridTime = (iso: string) => {
  const { h, mi } = madridParts(iso);
  return `${h}:${mi}`;
};

// dateKey is a Madrid YYYY-MM-DD (as produced by pairShifts via madridDayKeyOf).
const formatDateDDMMYY = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y.slice(2)}`;
};

const weekdayFmt = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short' });
const formatWeekday = (dateKey: string) =>
  weekdayFmt.format(new Date(`${dateKey}T12:00:00Z`)).replace(/\.$/, '');

const formatHm = (ms: number) => {
  const { h, m } = msToHm(ms);
  return `${h}:${String(m).padStart(2, '0')}`;
};

// --- Report model ------------------------------------------------------------

export function buildReportModel(punches: PunchRow[], dni: Record<string, string>): EmployeeReport[] {
  const byEmployee = new Map<string, PunchRow[]>();
  for (const p of punches) {
    const list = byEmployee.get(p.employee_id) ?? [];
    list.push(p);
    byEmployee.set(p.employee_id, list);
  }

  const reports: EmployeeReport[] = [];
  for (const [employeeId, empPunches] of byEmployee) {
    const { full_name, email } = empPunches[0];
    // pairShifts returns newest-first; the report reads chronologically.
    const shifts = pairShifts(empPunches).reverse();
    const rows: ShiftRow[] = shifts.map(s => {
      const complete = s.in && s.out;
      return {
        date: formatDateDDMMYY(s.date),
        weekday: formatWeekday(s.date),
        entrada: s.in ? madridTime(s.in.effective_time) : DASH,
        salida: s.out ? madridTime(s.out.effective_time) : DASH,
        horas: complete ? formatHm(new Date(s.out!.effective_time).getTime() - new Date(s.in!.effective_time).getTime()) : DASH,
      };
    });
    const totalMs = workedMsForDay(empPunches, null);
    reports.push({
      employeeId,
      fullName: full_name,
      email,
      dni: dni[email] ?? '___',
      rows,
      totalHoras: formatHm(totalMs),
      totalMs,
    });
  }

  reports.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  return reports;
}

// --- pdfmake document --------------------------------------------------------

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// The export period selected in the UI.
export type Period =
  | { scope: 'month'; month: string } // YYYY-MM
  | { scope: 'year'; year: string }   // YYYY
  | { scope: 'all' };

// Human label shown on the report (fixed Spanish).
export function periodLabel(p: Period): string {
  if (p.scope === 'month') {
    const [y, m] = p.month.split('-').map(Number);
    return `${MONTHS_ES[m - 1]} de ${y}`;
  }
  if (p.scope === 'year') return p.year;
  return 'Histórico completo';
}

// Suffix used in the download filename.
export function periodFileSuffix(p: Period): string {
  if (p.scope === 'month') return p.month;
  if (p.scope === 'year') return p.year;
  return 'completo';
}

// Returns a pdfmake docDefinition. Pure (no pdfmake import) so it is unit-testable.
export function buildDocDefinition(model: EmployeeReport[], company: CompanyInfo, period: Period) {
  const label = periodLabel(period);

  const employeePage = (emp: EmployeeReport, index: number) => {
    const tableBody = [
      [
        { text: 'Fecha', style: 'th' }, { text: 'Día', style: 'th' },
        { text: 'Entrada', style: 'th' }, { text: 'Salida', style: 'th' },
        { text: 'Horas', style: 'th' },
      ],
      ...emp.rows.map(r => [r.date, r.weekday, r.entrada, r.salida, r.horas]),
    ];
    return {
      ...(index > 0 ? { pageBreak: 'before' as const } : {}),
      stack: [
        { columns: [
          { text: 'REGISTRO DE JORNADA', style: 'title' },
          { text: label, alignment: 'right', style: 'period' },
        ] },
        { text: `Empresa: ${company.name}     CIF: ${company.cif}`, style: 'meta', margin: [0, 8, 0, 0] },
        { text: `Trabajador/a: ${emp.fullName}     DNI: ${emp.dni}`, style: 'meta' },
        {
          table: { headerRows: 1, widths: ['auto', 'auto', '*', '*', 'auto'], body: tableBody },
          layout: 'lightHorizontalLines',
          margin: [0, 12, 0, 0],
        },
        { text: `Total mensual: ${emp.totalHoras}`, style: 'total', alignment: 'right', margin: [0, 10, 0, 0] },
        { columns: [
          { text: 'Firma trabajador/a: ____________________' },
          { text: 'Firma empresa: ____________________', alignment: 'right' },
        ], margin: [0, 40, 0, 0], style: 'meta' },
      ],
    };
  };

  return {
    pageMargins: [40, 40, 40, 50] as [number, number, number, number],
    content: model.map(employeePage),
    styles: {
      title: { fontSize: 16, bold: true },
      period: { fontSize: 12, bold: true },
      meta: { fontSize: 10 },
      th: { bold: true, fontSize: 10 },
      total: { fontSize: 11, bold: true },
    },
    defaultStyle: { fontSize: 10 },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: `Generado: ${label}`, style: 'meta', margin: [40, 0, 0, 0] },
        { text: `Página ${currentPage}/${pageCount}`, alignment: 'right', margin: [0, 0, 40, 0], style: 'meta' },
      ],
      fontSize: 8,
    }),
  };
}

// Build the report from the month's punches and trigger a browser download.
// pdfmake (and its embedded fonts) is imported here, lazily, so it stays out of
// the main bundle and is only fetched when the user actually exports a PDF.
export async function downloadMonthlyPdf(punches: PunchRow[], period: Period): Promise<void> {
  const doc = buildDocDefinition(buildReportModel(punches, EMPLOYEE_DNI), COMPANY_INFO, period);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pdfMakeMod: any = await import('pdfmake/build/pdfmake');
  const vfsMod: any = await import('pdfmake/build/vfs_fonts');
  const pdfMake = pdfMakeMod.default ?? pdfMakeMod;
  pdfMake.vfs = vfsMod.default ?? vfsMod;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  pdfMake.createPdf(doc).download(`registro-jornada-${periodFileSuffix(period)}.pdf`);
}
