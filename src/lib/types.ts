// src/lib/types.ts
export interface Employee {
  id: string;
  email: string;
  full_name: string;
  role: 'employee' | 'admin';
  active: boolean;
}

export interface Punch {
  id: string;
  employee_id: string;
  kind: 'in' | 'out';
  recorded_at: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  office_id: string;
}

export interface EffectivePunch {
  id: string;
  employee_id: string;
  kind: 'in' | 'out';
  effective_time: string;
  source_punch_id: string | null;
  source_request_id: string | null;
  superseded_at: string | null;
  superseded_by_request_id: string | null;
}

export interface PunchEditRequest {
  id: string;
  employee_id: string;
  original_punch_id: string | null;
  requested_kind: 'in' | 'out';
  requested_time: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  created_by: string | null;
  action: 'add' | 'modify' | 'delete';
  target_effective_id: string | null;
}
