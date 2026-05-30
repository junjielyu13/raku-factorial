// Excel (.xlsx) export — a management/visualization view for the owner (the
// legal record is the PDF). Two sheets: a per-employee summary and a flat
// detail of paired daily shifts. Reuses the PDF report model so the numbers
// match. ExcelJS is lazy-imported in `downloadExcel` to keep it out of the
// main bundle.
import { buildReportModel, periodFileSuffix, type PunchRow, type Period } from './monthlyPdf';

export interface ExcelSummaryRow { name: string; email: string; hours: number }
export interface ExcelDetailRow {
  name: string; date: string; weekday: string; entrada: string; salida: string; horas: string;
}
export interface ExcelModel { summary: ExcelSummaryRow[]; detail: ExcelDetailRow[] }

const round2 = (n: number) => Math.round(n * 100) / 100;

// Pure: shape punches into summary + detail rows. Unit-testable.
export function buildExcelModel(punches: PunchRow[]): ExcelModel {
  const model = buildReportModel(punches, {}); // DNI not needed for Excel
  return {
    summary: model.map(e => ({ name: e.fullName, email: e.email, hours: round2(e.totalMs / 3_600_000) })),
    detail: model.flatMap(e => e.rows.map(r => ({
      name: e.fullName, date: r.date, weekday: r.weekday,
      entrada: r.entrada, salida: r.salida, horas: r.horas,
    }))),
  };
}

// Column headers / sheet names, passed in from the UI so they follow the
// current locale (the Excel is for the owner, not a fixed-language legal doc).
export interface ExcelLabels {
  summarySheet: string;
  detailSheet: string;
  colEmployee: string;
  colEmail: string;
  colTotalHours: string;
  colDate: string;
  colWeekday: string;
  colIn: string;
  colOut: string;
  colHours: string;
}

export async function downloadExcel(punches: PunchRow[], period: Period, labels: ExcelLabels): Promise<void> {
  const { summary, detail } = buildExcelModel(punches);
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();

  const styleHeader = (ws: import('exceljs').Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F5EE' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const summaryWs = wb.addWorksheet(labels.summarySheet);
  summaryWs.columns = [
    { header: labels.colEmployee, key: 'name', width: 22 },
    { header: labels.colEmail, key: 'email', width: 30 },
    { header: labels.colTotalHours, key: 'hours', width: 14, style: { numFmt: '0.00' } },
  ];
  summary.forEach(r => summaryWs.addRow(r));
  styleHeader(summaryWs);

  const detailWs = wb.addWorksheet(labels.detailSheet);
  detailWs.columns = [
    { header: labels.colEmployee, key: 'name', width: 22 },
    { header: labels.colDate, key: 'date', width: 12 },
    { header: labels.colWeekday, key: 'weekday', width: 8 },
    { header: labels.colIn, key: 'entrada', width: 10 },
    { header: labels.colOut, key: 'salida', width: 10 },
    { header: labels.colHours, key: 'horas', width: 10 },
  ];
  detail.forEach(r => detailWs.addRow(r));
  styleHeader(detailWs);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `raku-sant-cugat-punches-${periodFileSuffix(period)}.xlsx`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
