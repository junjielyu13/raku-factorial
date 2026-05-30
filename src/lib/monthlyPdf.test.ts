import { describe, it, expect } from 'vitest';
import { buildReportModel, buildDocDefinition, type PunchRow } from './monthlyPdf';

// Helper: a punch in UTC. May 2026 is CEST (UTC+2), so 10:31Z -> 12:31 Madrid.
function p(employee_id: string, full_name: string, kind: 'in' | 'out', isoUtc: string, email = `${employee_id}@x.es`): PunchRow {
  return { employee_id, full_name, email, kind, effective_time: isoUtc };
}

describe('buildReportModel', () => {
  it('groups punches by employee and sorts employees by name', () => {
    const rows = [
      p('b', 'Bruno', 'in', '2026-05-01T10:30:00Z'),
      p('a', 'Ana', 'in', '2026-05-01T10:30:00Z'),
    ];
    const model = buildReportModel(rows, {});
    expect(model.map(e => e.fullName)).toEqual(['Ana', 'Bruno']);
  });

  it('pairs in/out into a shift row with Madrid-local times and Spanish date', () => {
    const rows = [
      p('a', 'Ana', 'in', '2026-05-01T10:31:00Z'),   // 12:31 Madrid
      p('a', 'Ana', 'out', '2026-05-01T14:58:00Z'),  // 16:58 Madrid
    ];
    const [emp] = buildReportModel(rows, {});
    expect(emp.rows).toHaveLength(1);
    expect(emp.rows[0]).toMatchObject({
      date: '01/05/26',
      entrada: '12:31',
      salida: '16:58',
      horas: '4:27',
    });
    expect(emp.rows[0].weekday.toLowerCase()).toContain('vie'); // 2026-05-01 is Friday
  });

  it('renders a split shift (jornada partida) as two rows with the date repeated', () => {
    const rows = [
      p('a', 'Ana', 'in', '2026-05-01T10:31:00Z'),
      p('a', 'Ana', 'out', '2026-05-01T14:58:00Z'),
      p('a', 'Ana', 'in', '2026-05-01T17:33:00Z'),   // 19:33 Madrid
      p('a', 'Ana', 'out', '2026-05-01T21:02:00Z'),  // 23:02 Madrid
    ];
    const [emp] = buildReportModel(rows, {});
    expect(emp.rows).toHaveLength(2);
    expect(emp.rows.map(r => r.date)).toEqual(['01/05/26', '01/05/26']);
    expect(emp.rows[1]).toMatchObject({ entrada: '19:33', salida: '23:02', horas: '3:29' });
  });

  it('marks an open shift (in with no out) with — and excludes it from the total', () => {
    const rows = [p('a', 'Ana', 'in', '2026-05-01T10:31:00Z')];
    const [emp] = buildReportModel(rows, {});
    expect(emp.rows[0]).toMatchObject({ entrada: '12:31', salida: '—', horas: '—' });
    expect(emp.totalHoras).toBe('0:00');
  });

  it('marks a stray out (out with no preceding in) with — on entrada', () => {
    const rows = [p('a', 'Ana', 'out', '2026-05-01T14:58:00Z')];
    const [emp] = buildReportModel(rows, {});
    expect(emp.rows[0]).toMatchObject({ entrada: '—', salida: '16:58', horas: '—' });
    expect(emp.totalHoras).toBe('0:00');
  });

  it('sums paired-shift durations into the monthly total', () => {
    const rows = [
      p('a', 'Ana', 'in', '2026-05-01T10:31:00Z'),
      p('a', 'Ana', 'out', '2026-05-01T14:58:00Z'),  // 4:27
      p('a', 'Ana', 'in', '2026-05-02T10:30:00Z'),
      p('a', 'Ana', 'out', '2026-05-02T15:01:00Z'),  // 4:31
    ];
    const [emp] = buildReportModel(rows, {});
    expect(emp.totalHoras).toBe('8:58');
  });

  it('orders an employee\'s shift rows chronologically', () => {
    const rows = [
      p('a', 'Ana', 'in', '2026-05-02T10:30:00Z'),
      p('a', 'Ana', 'out', '2026-05-02T15:01:00Z'),
      p('a', 'Ana', 'in', '2026-05-01T10:31:00Z'),
      p('a', 'Ana', 'out', '2026-05-01T14:58:00Z'),
    ];
    const [emp] = buildReportModel(rows, {});
    expect(emp.rows.map(r => r.date)).toEqual(['01/05/26', '02/05/26']);
  });

  it('uses the DNI map, falling back to a placeholder when absent', () => {
    const rows = [
      p('a', 'Ana', 'in', '2026-05-01T10:31:00Z', 'ana@x.es'),
      p('b', 'Bruno', 'in', '2026-05-01T10:31:00Z', 'bruno@x.es'),
    ];
    const model = buildReportModel(rows, { 'ana@x.es': '12345678Z' });
    expect(model.find(e => e.fullName === 'Ana')!.dni).toBe('12345678Z');
    expect(model.find(e => e.fullName === 'Bruno')!.dni).toBe('___');
  });
});

describe('buildDocDefinition', () => {
  const model = [
    { employeeId: 'a', fullName: 'Ana', dni: '___', totalHoras: '4:27',
      rows: [{ date: '01/05/26', weekday: 'vie', entrada: '12:31', salida: '16:58', horas: '4:27' }] },
    { employeeId: 'b', fullName: 'Bruno', dni: '___', totalHoras: '0:00', rows: [] },
  ];
  const company = { name: 'Mi Empresa SL', cif: 'B12345678' };

  it('starts each employee after the first on a new page (one page per employee)', () => {
    const doc = buildDocDefinition(model, company, '2026-05');
    const pageBreaks = JSON.stringify(doc.content).match(/"pageBreak":"before"/g) ?? [];
    expect(pageBreaks).toHaveLength(model.length - 1);
  });

  it('includes the company identity and the month in the document', () => {
    const doc = buildDocDefinition(model, company, '2026-05');
    const text = JSON.stringify(doc.content);
    expect(text).toContain('Mi Empresa SL');
    expect(text).toContain('B12345678');
    expect(text.toLowerCase()).toContain('mayo');
  });

  it('renders a page x/y footer', () => {
    const doc = buildDocDefinition(model, company, '2026-05');
    const footer = doc.footer(2, 3);
    expect(JSON.stringify(footer)).toContain('2');
    expect(JSON.stringify(footer)).toContain('3');
  });
});
