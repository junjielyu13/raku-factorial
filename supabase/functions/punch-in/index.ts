// supabase/functions/punch-in/index.ts
import {
  authenticate, adminClient, jsonResponse,
  handleCors, errorResponse, HttpError,
} from "../_shared/auth.ts";

interface PunchBody {
  kind: 'in' | 'out';
  latitude: number;
  longitude: number;
  accuracy_m?: number | null;
}

Deno.serve(async (req) => {
  try {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD');

    const user = await authenticate(req);
    const body = await req.json() as PunchBody;

    if (body.kind !== 'in' && body.kind !== 'out') {
      throw new HttpError(400, 'BAD_KIND');
    }

    // GPS is required for audit but no geofence enforcement.
    if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
      throw new HttpError(400, 'GPS_REQUIRED');
    }
    const acc = typeof body.accuracy_m === 'number' ? body.accuracy_m : null;

    const admin = adminClient();
    const userAgent = req.headers.get('user-agent') ?? null;
    const fwdFor = req.headers.get('x-forwarded-for') ?? null;
    const ip = fwdFor?.split(',')[0]?.trim() ?? null;

    const { data: created, error: rpcErr } = await admin.rpc('create_punch', {
      p_employee_id: user.id,
      p_kind:        body.kind,
      p_lat:         body.latitude,
      p_lng:         body.longitude,
      p_accuracy:    acc,
      p_user_agent:  userAgent,
      p_ip:          ip,
    });
    if (rpcErr) {
      if (rpcErr.code === 'P0003') throw new HttpError(409, 'TOO_SOON');
      if (rpcErr.code === 'P0004') throw new HttpError(409, 'INVALID_SEQUENCE');
      throw rpcErr;
    }

    const row = Array.isArray(created) ? created[0] : created;
    return jsonResponse(200, { punch_id: row.id, recorded_at: row.recorded_at });
  } catch (err) {
    return errorResponse(err);
  }
});
