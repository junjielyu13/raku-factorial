// supabase/functions/submit-edit-request/index.ts
import {
  authenticate, adminClient, jsonResponse,
  handleCors, errorResponse, HttpError,
} from "../_shared/auth.ts";

interface Body {
  requested_kind: 'in' | 'out';
  requested_time: string;        // ISO timestamp
  reason: string;
  original_punch_id?: string;
}

Deno.serve(async (req) => {
  try {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD');

    const user = await authenticate(req);
    const body = await req.json() as Body;

    if (body.requested_kind !== 'in' && body.requested_kind !== 'out')
      throw new HttpError(400, 'BAD_KIND');
    if (typeof body.reason !== 'string' || body.reason.trim().length === 0)
      throw new HttpError(400, 'BAD_REASON');

    const when = new Date(body.requested_time);
    if (isNaN(when.getTime())) throw new HttpError(400, 'BAD_TIME');
    if (when.getTime() > Date.now()) throw new HttpError(400, 'FUTURE_TIME');

    const admin = adminClient();
    const { error } = await admin.from('punch_edit_requests').insert({
      employee_id:       user.id,
      original_punch_id: body.original_punch_id ?? null,
      requested_kind:    body.requested_kind,
      requested_time:    when.toISOString(),
      reason:            body.reason.trim(),
    });
    if (error) throw error;

    return jsonResponse(200, { ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
