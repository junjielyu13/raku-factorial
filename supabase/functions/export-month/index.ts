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
    const format = url.searchParams.get('format') ?? 'csv';
    if (format !== 'csv' && format !== 'json') throw new HttpError(400, 'BAD_FORMAT');

    // Export period: scope=all (no date filter), year=YYYY, or month=YYYY-MM.
    // `period` is used for the filename / report label.
    const scope = url.searchParams.get('scope');
    const month = url.searchParams.get('month');
    const year = url.searchParams.get('year');
    let start: Date | null = null;
    let end: Date | null = null;
    let period: string;
    if (scope === 'all') {
      period = 'completo';
    } else if (year !== null) {
      if (!/^\d{4}$/.test(year)) throw new HttpError(400, 'BAD_YEAR');
      const y = Number(year);
      start = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
      end   = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0));
      period = year;
    } else {
      if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'BAD_MONTH');
      const [y, m] = month.split('-').map(Number);
      start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      end   = new Date(Date.UTC(y, m, 1, 0, 0, 0));
      period = month;
    }

    const admin = adminClient();

    let query = admin
      .from('effective_punches')
      .select('employee_id, kind, effective_time, employees(email, full_name)')
      .is('superseded_at', null)
      .order('effective_time', { ascending: true });
    if (start) query = query.gte('effective_time', start.toISOString());
    if (end)   query = query.lt('effective_time', end.toISOString());
    if (user.role !== 'admin' && user.role !== 'it') {
      query = query.eq('employee_id', user.id);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    let totalsQuery = admin
      .from('monthly_hours')
      .select('employee_id, month, worked_total, employees!inner(email)');
    if (start) totalsQuery = totalsQuery.gte('month', start.toISOString().slice(0, 10));
    if (end)   totalsQuery = totalsQuery.lt('month', end.toISOString().slice(0, 10));
    if (user.role !== 'admin' && user.role !== 'it') {
      totalsQuery = totalsQuery.eq('employee_id', user.id);
    }
    const { data: totals } = await totalsQuery;

    // monthly_hours has one row per (employee, month); for year/all scopes sum
    // them into a single total per employee.
    const totalsByEmail = new Map<string, number>();
    for (const t of totals ?? []) {
      const email = (t as any).employees.email as string;
      totalsByEmail.set(email, (totalsByEmail.get(email) ?? 0) + intervalToHours(t.worked_total as string | null));
    }

    // JSON: flat structured data; the frontend builds the compliance PDF from it.
    if (format === 'json') {
      const body = {
        period,
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
        totals: [...totalsByEmail].map(([email, hours]) => ({ email, hours })),
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
    // Append per-employee totals (summed across months for year/all scopes).
    lines.push('');
    lines.push(['employee_email', 'worked_total_hours'].join(','));
    for (const [email, hours] of totalsByEmail) {
      lines.push([csvEscape(email), hours.toFixed(2)].join(','));
    }
    const csv = lines.join('\n') + '\n';

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="punches-${period}.csv"`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
