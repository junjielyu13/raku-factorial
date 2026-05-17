// src/lib/api.ts
import { supabase } from './supabase';

interface PunchInArgs {
  kind: 'in' | 'out';
  latitude: number;
  longitude: number;
  accuracy_m: number;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

async function invoke<T>(name: string, body: unknown, method: 'POST' | 'GET' = 'POST', searchParams?: Record<string, string>): Promise<T> {
  if (method === 'POST') {
    const { data, error } = await supabase.functions.invoke<T>(name, { body });
    if (error) {
      const status = (error as unknown as { context?: { status?: number; json?: { error?: string; message?: string } } }).context?.status ?? 500;
      const json = (error as unknown as { context?: { json?: { error?: string; message?: string } } }).context?.json;
      throw { status, code: json?.error ?? 'UNKNOWN', message: json?.message ?? error.message } as ApiError;
    }
    return data as T;
  } else {
    const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`);
    if (searchParams) for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${session?.access_token}` },
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({})) as { error?: string; message?: string };
      throw { status: res.status, code: json.error ?? 'UNKNOWN', message: json.message ?? res.statusText } as ApiError;
    }
    return await res.text() as unknown as T;
  }
}

export function punchIn(args: PunchInArgs) {
  return invoke<{ punch_id: string; recorded_at: string }>('punch-in', args);
}

export function submitEditRequest(args: {
  requested_kind: 'in' | 'out';
  requested_time: string;
  reason: string;
  original_punch_id?: string;
}) {
  return invoke<{ ok: true }>('submit-edit-request', args);
}

export function approveEdit(request_id: string, note: string) {
  return invoke<{ ok: true }>('approve-edit', { request_id, note });
}

export function rejectEdit(request_id: string, note: string) {
  return invoke<{ ok: true }>('reject-edit', { request_id, note });
}

export function exportMonthCsv(month: string) {
  return invoke<string>('export-month', null, 'GET', { month });
}
