// supabase/functions/admin-backfill-week/index.ts
// Admin one-click "backfill week": insert all the missing scheduled punches for
// one employee in a single atomic RPC. The frontend computes which punches are
// missing (see src/lib/backfill.ts) and sends the list here.
import {
  authenticate, requireAdmin, adminClient, jsonResponse,
  handleCors, errorResponse, HttpError,
} from "../_shared/auth.ts";

interface Punch { kind: 'in' | 'out'; time: string }
interface Body { employee_id?: string; punches?: Punch[]; reason?: string }

Deno.serve(async (req) => {
  try {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD');

    const user = await authenticate(req);
    requireAdmin(user);

    const body = await req.json() as Body;

    if (!body.employee_id) throw new HttpError(400, 'BAD_EMPLOYEE');
    if (typeof body.reason !== 'string' || body.reason.trim().length === 0)
      throw new HttpError(400, 'BAD_REASON');
    if (!Array.isArray(body.punches) || body.punches.length === 0)
      throw new HttpError(400, 'NO_PUNCHES');

    const punches = body.punches.map((p) => {
      if (p.kind !== 'in' && p.kind !== 'out') throw new HttpError(400, 'BAD_KIND');
      const when = new Date(p.time ?? '');
      if (isNaN(when.getTime())) throw new HttpError(400, 'BAD_TIME');
      if (when.getTime() > Date.now()) throw new HttpError(400, 'FUTURE_TIME');
      return { kind: p.kind, time: when.toISOString() };
    });

    const admin = adminClient();
    const { data, error } = await admin.rpc('admin_backfill_punches', {
      p_admin_id:    user.id,
      p_employee_id: body.employee_id,
      p_punches:     punches,
      p_reason:      body.reason.trim(),
    });
    if (error) {
      if (error.code === 'P0001') throw new HttpError(409, 'ALREADY_CHANGED');
      if (error.code === 'P0002') throw new HttpError(400, 'BAD_REQUEST');
      throw error;
    }

    return jsonResponse(200, { ok: true, count: data ?? punches.length });
  } catch (err) {
    return errorResponse(err);
  }
});
