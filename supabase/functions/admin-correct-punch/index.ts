// supabase/functions/admin-correct-punch/index.ts
import {
  authenticate, requireAdmin, adminClient, jsonResponse,
  handleCors, errorResponse, HttpError,
} from "../_shared/auth.ts";

interface Body {
  action: 'add' | 'modify' | 'delete';
  target_effective_id?: string;
  employee_id?: string;
  kind?: 'in' | 'out';
  time?: string;          // ISO timestamp
  reason: string;
}

Deno.serve(async (req) => {
  try {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD');

    const user = await authenticate(req);
    requireAdmin(user);

    const body = await req.json() as Body;

    if (body.action !== 'add' && body.action !== 'modify' && body.action !== 'delete')
      throw new HttpError(400, 'BAD_ACTION');
    if (typeof body.reason !== 'string' || body.reason.trim().length === 0)
      throw new HttpError(400, 'BAD_REASON');

    let kind: string | null = null;
    let timeIso: string | null = null;

    if (body.action === 'add' || body.action === 'modify') {
      if (body.kind !== 'in' && body.kind !== 'out')
        throw new HttpError(400, 'BAD_KIND');
      kind = body.kind;
      const when = new Date(body.time ?? '');
      if (isNaN(when.getTime())) throw new HttpError(400, 'BAD_TIME');
      if (when.getTime() > Date.now()) throw new HttpError(400, 'FUTURE_TIME');
      timeIso = when.toISOString();
    }
    if (body.action === 'add' && !body.employee_id)
      throw new HttpError(400, 'BAD_EMPLOYEE');
    if ((body.action === 'modify' || body.action === 'delete') && !body.target_effective_id)
      throw new HttpError(400, 'BAD_TARGET');

    const admin = adminClient();
    const { error } = await admin.rpc('admin_correct_punch', {
      p_admin_id:            user.id,
      p_action:              body.action,
      p_target_effective_id: body.target_effective_id ?? null,
      p_employee_id:         body.employee_id ?? null,
      p_kind:                kind,
      p_time:                timeIso,
      p_reason:              body.reason.trim(),
    });
    if (error) {
      if (error.code === 'P0001') throw new HttpError(409, 'ALREADY_CHANGED');
      if (error.code === 'P0002') throw new HttpError(404, 'NOT_FOUND');
      throw error;
    }

    return jsonResponse(200, { ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
