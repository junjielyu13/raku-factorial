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

// [start, end) ISO instants for the Europe/Madrid civil day containing `d`.
// Used to scope add-request supersession to the requested day.
function madridDayBounds(d: Date): { start: string; end: string } {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const y = get('year'), m = get('month'), day = get('day');
  const asUtc = Date.UTC(y, m - 1, day, get('hour'), get('minute'), get('second'));
  const offsetMs = asUtc - d.getTime();
  const start = new Date(Date.UTC(y, m - 1, day, 0, 0, 0) - offsetMs);
  const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
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

    // Re-submissions replace the prior pending request:
    //   modify / delete – any pending row on the same target_effective_id
    //   add             – any pending add by this user, same kind, same Madrid day
    // The old row is moved to status='superseded' (audit-preserving) rather than
    // deleted, and won't appear in the admin pending queue.
    if (action === 'add') {
      const { start, end } = madridDayBounds(when);
      await admin.from('punch_edit_requests')
        .update({ status: 'superseded' })
        .eq('employee_id', user.id)
        .eq('status', 'pending')
        .eq('action', 'add')
        .eq('requested_kind', kind)
        .gte('requested_time', start)
        .lt('requested_time', end);
    } else {
      await admin.from('punch_edit_requests')
        .update({ status: 'superseded' })
        .eq('employee_id', user.id)
        .eq('status', 'pending')
        .eq('target_effective_id', body.target_effective_id!);
    }

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
