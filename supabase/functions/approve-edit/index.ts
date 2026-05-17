// supabase/functions/approve-edit/index.ts
import {
  authenticate, requireAdmin, adminClient, jsonResponse,
  handleCors, errorResponse, HttpError,
} from "../_shared/auth.ts";

interface Body { request_id: string; note?: string }

Deno.serve(async (req) => {
  try {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD');

    const user = await authenticate(req);
    requireAdmin(user);

    const body = await req.json() as Body;
    if (!body.request_id) throw new HttpError(400, 'BAD_REQUEST_ID');

    const admin = adminClient();
    const { error } = await admin.rpc('approve_edit_request', {
      p_request_id:  body.request_id,
      p_reviewer_id: user.id,
      p_note:        body.note ?? '',
    });
    if (error) {
      // map Postgres SQLSTATE → HTTP
      if (error.code === 'P0001') throw new HttpError(409, 'ALREADY_DECIDED');
      if (error.code === 'P0002') throw new HttpError(404, 'NOT_FOUND');
      throw error;
    }

    return jsonResponse(200, { ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
