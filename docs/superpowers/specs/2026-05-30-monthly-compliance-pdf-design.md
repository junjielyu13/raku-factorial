# Monthly Compliance PDF Export — Design

**Date:** 2026-05-30
**Status:** Approved (pending spec review)

## Goal

Add a PDF export alongside the existing monthly CSV export. The PDF is a formal
**registro de jornada** (RD-ley 8/2019 working-time record) intended as a
compliance/archive document a labor inspector could accept. One signable sheet
per employee.

Scope: admin exports all employees (one page each); a non-admin employee exports
only their own record. This mirrors the role gating already in the `export-month`
Edge Function.

## Form & layout

- **One PDF, one employee per page** (page break between employees).
- **Body language is fixed Spanish** — it is a legal document for Spanish
  authorities, independent of the UI locale. Field labels use Spanish terms:
  `REGISTRO DE JORNADA`, `Empresa`, `CIF`, `Trabajador/a`, `DNI`, `Fecha`,
  `Día`, `Entrada`, `Salida`, `Horas`, `Total mensual`, `Firma`.
- Data values (employee names, etc.) shown as-is.

Per-page layout:

```
REGISTRO DE JORNADA                         [mayo 2026]
Empresa: ___ (placeholder)        CIF: ___ (placeholder)
Trabajador/a: <full_name>         DNI: ___ (placeholder per employee)
────────────────────────────────────────────────────
Fecha      Día    Entrada  Salida   Horas
01/05/26   jue    12:31    16:58    4:27
01/05/26   jue    19:33    23:02    3:29   <- split shift: one row per shift
02/05/26   vie    12:30    17:01    4:31
...
────────────────────────────────────────────────────
Total mensual:                      162:14

Firma trabajador/a: ________   Firma empresa: ________
[footer: generated-at timestamp · page x/y]
```

- **Split shifts (jornada partida):** each shift is its own row. The date repeats.
- **Date format:** `DD/MM/YY`; weekday is the Spanish short day name; times are
  `HH:MM` in `Europe/Madrid`; durations are `H:MM`.
- **Monthly total** = sum of paired-shift durations for that employee in the month.

### Anomalies

- **Open shift** (`in` with no matching `out`): `Salida` column shows `—`, the
  row contributes 0 to the total.
- **Stray out** (`out` with no preceding `in`): `Entrada` column shows `—`, row
  contributes 0.

These reuse the existing `pairShifts()` classification (`isOpen`, `isStrayOut`).

## Architecture & data flow

### Backend — `supabase/functions/export-month/index.ts`

Add a `format` query param (`csv` default, `json` new). Existing CSV behavior is
unchanged when `format` is absent or `csv`.

`format=json` returns the structured data the function already queries, as JSON:

```jsonc
{
  "month": "2026-05",
  "punches": [
    { "employee_id": "...", "kind": "in", "effective_time": "<iso>",
      "email": "...", "full_name": "..." }
  ],
  "totals": [ { "employee_id": "...", "email": "...", "worked_total": "<interval>" } ]
}
```

Reuses the same `effective_punches` query, `superseded_at IS NULL` filter, date
range, and the role gate (`if role not in {admin, it}` → `eq employee_id`).
Stays on the service-role `adminClient()` path — does not bypass the established
secure read pattern. Same CORS headers.

The frontend builds the PDF from `punches` (the per-employee monthly totals are
recomputed client-side from paired shifts so the PDF total matches its own rows;
`totals` is included for parity but the PDF uses the shift sum).

### Frontend

- `src/lib/api.ts`: add `exportMonthData(month)` → `invoke<MonthExport>('export-month', null, 'GET', { month, format: 'json' })`.
- `src/lib/companyInfo.ts` (new): company identity + per-employee DNI, all
  placeholders for now:
  ```ts
  export const COMPANY_INFO = { name: '___', cif: '___' };
  // DNI keyed by employee email; missing → '___'
  export const EMPLOYEE_DNI: Record<string, string> = {};
  ```
  The user will fill these in later.
- `src/lib/monthlyPdf.ts` (new): pure data-shaping + pdfmake doc assembly.
  1. Group `punches` by `employee_id`.
  2. For each employee, `pairShifts()` → daily shift rows; `msToHm()` for
     durations; sum for monthly total.
  3. Build a pdfmake `docDefinition`: one page per employee (page break),
     header block, shift table, total, signature lines, footer with page x/y.
  4. Trigger download (`pdfMake.createPdf(doc).download(filename)`),
     filename `registro-jornada-<month>.pdf`.
- `src/admin/AdminExport.tsx`: add a **"Download PDF"** button beside the
  existing CSV button. Same month input, same error handling pattern
  (`ApiError.code` → `t('admin.export.failed', ...)`).

### PDF library

**pdfmake**, loaded via dynamic `import()` inside `monthlyPdf.ts` so it is only
fetched when the user generates a PDF (keeps it out of the main bundle). pdfmake's
bundled font (Roboto) renders Spanish accented characters correctly. No backend
PDF tooling (Deno PDF ecosystem is poor).

## i18n

- New button label `admin.export.downloadPdf` added to `zh` / `en` / `es` in
  `src/i18n/messages.ts` ("下载 PDF" / "Download PDF" / "Descargar PDF").
- Reuse existing `admin.export.generating` / `admin.export.failed`.
- **PDF body text is hardcoded Spanish and does NOT go through i18n** (fixed legal
  language).

## Error handling

- JSON fetch failure → same inline error card as CSV, via `ApiError.code`.
- Empty month (no punches) → still produce a PDF: each active employee's page (or
  the single employee's page) with an empty table and `Total mensual: 0:00`.
  (Backend currently returns only employees that have punches; for v1 the PDF
  reflects whoever appears in `punches`. Listing zero-punch employees is out of
  scope.)

## Testing

- **Unit (vitest):** the pure shaping logic in `monthlyPdf.ts` — grouping,
  shift pairing wiring, monthly-hour totals, `—` for open/stray shifts, DNI
  placeholder fallback, split-shift produces multiple rows.
- **Smoke:** assembling a `docDefinition` from sample data yields a non-empty doc
  with one page (page-break entry) per employee. pdfmake's actual PDF byte
  rendering is not deep-tested.

## Out of scope (YAGNI)

- Server-side PDF generation.
- Geofence/GPS annotations in the PDF.
- Digital signatures (paper signature lines only).
- Listing employees with zero punches in the month.
- Configurable PDF language.
