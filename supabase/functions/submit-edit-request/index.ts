// supabase/functions/submit-edit-request/index.ts
import {
  authenticate, adminClient, jsonResponse,
  handleCors, errorResponse, HttpError,
} from "../_shared/auth.ts";

interface Body {
  action?: 'add' | 'modify' | 'delete';
  requested_kind?: 'in' | 'out';
  requested_time?: string;        // ISO timestamp (required for add/modify)
  reason: string;
  original_punch_id?: string;
  target_effective_id?: string;
}

Deno.serve(async (req) => {
  try {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD');

    const user = await authenticate(req);
    const body = await req.json() as Body;

    const action = body.action ?? 'add';
    if (action !== 'add' && action !== 'modify' && action !== 'delete')
      throw new HttpError(400, 'BAD_ACTION');

    if (typeof body.reason !== 'string' || body.reason.trim().length === 0)
      throw new HttpError(400, 'BAD_REASON');

    const admin = adminClient();

    // modify / delete need a target_effective_id pointing at a live row owned by this user
    let targetKind: 'in' | 'out' | null = null;
    let targetTime: string | null = null;
    let targetSourcePunchId: string | null = null;
    if (action !== 'add') {
      if (!body.target_effective_id) throw new HttpError(400, 'BAD_TARGET');
      const { data: tgt, error: tgtErr } = await admin.from('effective_punches')
        .select('id, employee_id, kind, effective_time, source_punch_id, superseded_at')
        .eq('id', body.target_effective_id).single();
      if (tgtErr || !tgt) throw new HttpError(404, 'TARGET_NOT_FOUND');
      if (tgt.employee_id !== user.id) throw new HttpError(403, 'NOT_OWNER');
      if (tgt.superseded_at) throw new HttpError(409, 'ALREADY_SUPERSEDED');
      targetKind = tgt.kind as 'in' | 'out';
      targetTime = tgt.effective_time;
      targetSourcePunchId = tgt.source_punch_id;
    }

    // requested_kind / requested_time semantics by action:
    //   add    – both required from body
    //   modify – kind keeps target's kind; time required from body
    //   delete – kind & time mirror target (for audit), nothing required from body
    let kind: 'in' | 'out';
    let when: Date;
    if (action === 'add') {
      if (body.requested_kind !== 'in' && body.requested_kind !== 'out')
        throw new HttpError(400, 'BAD_KIND');
      kind = body.requested_kind;
      when = new Date(body.requested_time ?? '');
    } else if (action === 'modify') {
      kind = targetKind!;
      when = new Date(body.requested_time ?? '');
    } else {
      kind = targetKind!;
      when = new Date(targetTime!);
    }

    if (isNaN(when.getTime())) throw new HttpError(400, 'BAD_TIME');
    if (when.getTime() > Date.now()) throw new HttpError(400, 'FUTURE_TIME');

    const { error } = await admin.from('punch_edit_requests').insert({
      employee_id:         user.id,
      original_punch_id:   body.original_punch_id ?? targetSourcePunchId ?? null,
      target_effective_id: action === 'add' ? null : body.target_effective_id,
      action,
      requested_kind:      kind,
      requested_time:      when.toISOString(),
      reason:              body.reason.trim(),
      created_by:          user.id,
    });
    if (error) throw error;

    return jsonResponse(200, { ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
