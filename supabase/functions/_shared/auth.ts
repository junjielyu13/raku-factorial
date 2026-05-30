// supabase/functions/_shared/auth.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

export interface AuthedUser {
  id: string;
  email: string;
  role: 'employee' | 'admin' | 'it';
}

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

export async function authenticate(req: Request): Promise<AuthedUser> {
  const header = req.headers.get('Authorization');
  if (!header) throw new HttpError(401, 'MISSING_AUTH');

  const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: header } },
  });
  const { data, error } = await user.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'INVALID_JWT');

  // Look up role from employees
  const admin = adminClient();
  const { data: emp, error: empErr } = await admin
    .from('employees')
    .select('id, email, role, active')
    .eq('id', data.user.id)
    .single();
  if (empErr || !emp) throw new HttpError(403, 'NOT_EMPLOYEE');
  if (!emp.active) throw new HttpError(403, 'INACTIVE');

  return { id: emp.id, email: emp.email, role: emp.role };
}

// 'it' holds the same privileges as 'admin' (it just isn't tracked for
// attendance), so both pass the admin gate.
export function requireAdmin(user: AuthedUser): void {
  if (user.role !== 'admin' && user.role !== 'it') throw new HttpError(403, 'NOT_ADMIN');
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    },
  });
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
      },
    });
  }
  return null;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return jsonResponse(err.status, { error: err.code, message: err.message });
  }
  console.error('unhandled', err);
  return jsonResponse(500, { error: 'INTERNAL' });
}
