import { describe, it, expect } from 'vitest';
import { buildExcelModel } from './excelExport';
import type { PunchRow } from './monthlyPdf';

function p(employee_id: string, full_name: string, kind: 'in' | 'out', isoUtc: string, email = `${employee_id}@x.es`): PunchRow {
  return { employee_id, full_name, email, kind, effective_time: isoUtc };
}

describe('buildExcelModel', () => {
  it('builds one summary row per employee with decimal-hour totals', () => {
    const rows = [
      p('a', 'Ana', 'in', '2026-05-01T10:31:00Z'),   // 12:31 Madrid
      p('a', 'Ana', 'out', '2026-05-01T14:58:00Z'),  // 16:58 -> 4h27m = 4.45h
    ];
    const m = buildExcelModel(rows);
    expect(m.summary).toEqual([{ name: 'Ana', email: 'a@x.es', hours: 4.45 }]);
  });

  it('builds a flat detail table of paired shifts across employees', () => {
    const rows = [
      p('b', 'Bruno', 'in', '2026-05-01T10:30:00Z'),
      p('b', 'Bruno', 'out', '2026-05-01T14:30:00Z'),
      p('a', 'Ana', 'in', '2026-05-01T10:31:00Z'),
      p('a', 'Ana', 'out', '2026-05-01T14:58:00Z'),
    ];
    const m = buildExcelModel(rows);
    // Sorted by employee name: Ana before Bruno.
    expect(m.detail.map(r => r.name)).toEqual(['Ana', 'Bruno']);
    expect(m.detail[0]).toMatchObject({
      name: 'Ana', date: '01/05/26', entrada: '12:31', salida: '16:58', horas: '4:27',
    });
  });

  it('keeps the — markers for an open shift and excludes it from the total', () => {
    const rows = [p('a', 'Ana', 'in', '2026-05-01T10:31:00Z')];
    const m = buildExcelModel(rows);
    expect(m.summary[0].hours).toBe(0);
    expect(m.detail[0]).toMatchObject({ salida: '—', horas: '—' });
  });
});
