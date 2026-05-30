// supabase/functions/export-month/index.ts
import {
  authenticate, adminClient, handleCors, errorResponse, HttpError,
} from "../_shared/auth.ts";

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function intervalToHours(interval: string | null): number {
  if (!interval) return 0;
  // Supabase JS returns Postgres intervals as strings like "08:00:00", "1 day 02:30:00", or "PT8H30M"
  // We handle the two common forms.
  // ISO 8601: "PT...H...M...S"
  const iso = interval.match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (iso) {
    return (Number(iso[1] ?? 0) + Number(iso[2] ?? 0) / 60 + Number(iso[3] ?? 0) / 3600);
  }
  // Postgres text: "[D days ]HH:MM:SS[.frac]"
  let days = 0;
  let rest = interval;
  const dm = interval.match(/^(\d+) days? (.+)$/);
  if (dm) { days = +dm[1]; rest = dm[2]; }
  const m = rest.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return 0;
  return days * 24 + +m[1] + +m[2] / 60 + +m[3] / 3600;
}

function formatMadrid(d: Date): { date: string; time: string } {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

Deno.serve(async (req) => {
  try {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'GET') throw new HttpError(405, 'METHOD');

    const user = await authenticate(req);
    const url = new URL(req.url);
    const month = url.searchParams.get('month');
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'BAD_MONTH');
    const format = url.searchParams.get('format') ?? 'csv';
    if (format !== 'csv' && format !== 'json') throw new HttpError(400, 'BAD_FORMAT');

    const [y, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));   // start of month UTC
    const end   = new Date(Date.UTC(y, m,     1, 0, 0, 0));

    const admin = adminClient();

    let query = admin
      .from('effective_punches')
      .select('employee_id, kind, effective_time, employees(email, full_name)')
      .is('superseded_at', null)
      .gte('effective_time', start.toISOString())
      .lt('effective_time', end.toISOString())
      .order('effective_time', { ascending: true });
    if (user.role !== 'admin' && user.role !== 'it') {
      query = query.eq('employee_id', user.id);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    let totalsQuery = admin
      .from('monthly_hours')
      .select('employee_id, month, worked_total, employees!inner(email)')
      .gte('month', start.toISOString().slice(0, 10))
      .lt('month', end.toISOString().slice(0, 10));
    if (user.role !== 'admin' && user.role !== 'it') {
      totalsQuery = totalsQuery.eq('employee_id', user.id);
    }
    const { data: totals } = await totalsQuery;

    // JSON: flat structured data; the frontend builds the compliance PDF from it.
    if (format === 'json') {
      const body = {
        month,
        punches: (rows ?? []).map((r) => {
          const emp = (r as any).employees;
          return {
            employee_id: r.employee_id,
            kind: r.kind,
            effective_time: r.effective_time,
            email: emp.email,
            full_name: emp.full_name,
          };
        }),
        totals: (totals ?? []).map((t) => ({
          employee_id: t.employee_id,
          email: (t as any).employees.email,
          worked_total: t.worked_total ?? null,
        })),
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const lines: string[] = [
      ['employee_email', 'employee_name', 'work_date', 'kind', 'time_local', 'time_utc'].join(','),
    ];
    for (const r of rows ?? []) {
      const t = new Date(r.effective_time as string);
      const { date, time } = formatMadrid(t);
      const emp = (r as any).employees;
      lines.push([
        csvEscape(emp.email),
        csvEscape(emp.full_name),
        date,
        r.kind as string,
        time,
        t.toISOString(),
      ].join(','));
    }
    // Append per-employee totals from monthly_hours.
    lines.push('');
    lines.push(['employee_email', 'worked_total_hours'].join(','));
    for (const t of totals ?? []) {
      const emp = (t as any).employees;
      const interval = t.worked_total as string | null; // Postgres interval, e.g. "08:00:00" or "1 day 02:30:00"
      // Convert interval to hours (approx). Postgres returns ISO 8601 duration or HH:MM:SS depending on driver.
      const hours = intervalToHours(interval);
      lines.push([csvEscape(emp.email), hours.toFixed(2)].join(','));
    }
    const csv = lines.join('\n') + '\n';

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="punches-${month}.csv"`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
