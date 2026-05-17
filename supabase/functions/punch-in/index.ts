// supabase/functions/punch-in/index.ts
import {
  authenticate, adminClient, jsonResponse,
  handleCors, errorResponse, HttpError,
} from "../_shared/auth.ts";
import { haversineMeters } from "../_shared/haversine.ts";

interface PunchBody {
  kind: 'in' | 'out';
  latitude: number;
  longitude: number;
  accuracy_m: number;
}

const MAX_ACCURACY_M    = 100;

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
    if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
      throw new HttpError(400, 'BAD_COORDS');
    }
    if (typeof body.accuracy_m !== 'number' || body.accuracy_m < 0) {
      throw new HttpError(400, 'BAD_ACCURACY');
    }
    if (body.accuracy_m > MAX_ACCURACY_M) {
      throw new HttpError(400, 'LOW_ACCURACY');
    }

    const admin = adminClient();

    // find an office where this position is within radius
    const { data: offices, error: officesErr } = await admin
      .from('office_locations')
      .select('id, latitude, longitude, radius_meters')
      .eq('active', true);
    if (officesErr) throw officesErr;

    const matchingOffice = (offices ?? []).find((o) => {
      const d = haversineMeters(body.latitude, body.longitude, Number(o.latitude), Number(o.longitude));
      return d <= o.radius_meters;
    });
    if (!matchingOffice) throw new HttpError(400, 'OUT_OF_GEOFENCE');

    const userAgent = req.headers.get('user-agent') ?? null;
    const fwdFor = req.headers.get('x-forwarded-for') ?? null;
    const ip = fwdFor?.split(',')[0]?.trim() ?? null;

    const { data: created, error: rpcErr } = await admin.rpc('create_punch', {
      p_employee_id: user.id,
      p_kind:        body.kind,
      p_lat:         body.latitude,
      p_lng:         body.longitude,
      p_accuracy:    body.accuracy_m,
      p_office_id:   matchingOffice.id,
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
