# Admin Punch Corrections — Design

**Date:** 2026-05-18
**Status:** Approved, ready for implementation planning

## Problem

Admins need to fix employees' clock-in/out records: change a wrong time, add a
punch the employee forgot, or void a mistaken double-punch. The app currently
has no way to do this.

The existing edit-request flow only *adds* missing punches — `SubmitEditRequest.tsx`
never sets `original_punch_id`, and `approve_edit_request` always *inserts* a new
`effective_punches` row without superseding anything. There is no mechanism to
change or remove an already-recorded effective punch.

## Legal constraint (RD-ley 8/2019 / ITSS Criterio Técnico 101/2019)

Spanish labour law requires the time record to be reliable, truthful, and
traceable. Corrections are permitted, but only with a full audit trail: who
changed what, when, the original value, the new value, and the reason. Directly
overwriting `punches` is forbidden.

This design satisfies that: `punches` (immutable raw records) and
`punch_edit_requests` (the correction log) together form the audit trail.
`effective_punches` is the derived "current truth" layer used for dashboards and
reports — superseding a row there never destroys the underlying audit record.

## Scope

Three admin operations, all reachable from the admin dashboard:

1. **Modify** — change the time/kind of an existing effective punch.
2. **Add** — record a punch the employee never clocked.
3. **Delete** — void a mistaken punch (e.g. an accidental double-punch).

Every operation is logged and auto-approved (the admin is the lawful approver).

**Non-goals:** no employee-facing changes (employees still only add missing
punches via the existing flow); no geofence/GPS on manual corrections; no bulk
edit.

## Architecture decision

**Chosen approach:** extend `punch_edit_requests` as the universal audit log and
add a soft-delete flag to `effective_punches`.

Rejected alternatives:
- A separate `punch_corrections` table — produces two audit logs that approvals
  and CSV export must merge.
- Directly editable `effective_punches` + a generic JSON `audit_log` — audit
  trail becomes loose JSON, hard to query, diverges from the existing pattern.

The chosen approach keeps one audit log, matches the CLAUDE.md invariant
"corrections go through `punch_edit_requests`", and is fully additive — existing
rows and the existing employee flow are unaffected.

## 1. Data model — migration `20260518000002_admin_corrections.sql`

### `punch_edit_requests` — three new columns

| Column | Type | Notes |
|---|---|---|
| `created_by` | `uuid REFERENCES employees(id)` | Who initiated. `NULL` = the employee themselves (preserves existing-flow semantics). |
| `action` | `text NOT NULL DEFAULT 'add' CHECK (action IN ('add','modify','delete'))` | Operation type. |
| `target_effective_id` | `uuid REFERENCES effective_punches(id)` | Which effective row a `modify`/`delete` supersedes. `NULL` for `add`. |

### `effective_punches` — soft-delete pair

| Column | Type | Notes |
|---|---|---|
| `superseded_at` | `timestamptz` | `NULL` = active. Non-null = no longer counts. |
| `superseded_by_request_id` | `uuid REFERENCES punch_edit_requests(id)` | The correction that superseded this row. |

The existing `(source_punch_id IS NOT NULL) XOR (source_request_id IS NOT NULL)`
CHECK is unchanged: `add`/`modify` create request-sourced effective rows;
`delete` creates none.

## 2. RPC — `admin_correct_punch(...)`

`SECURITY DEFINER`, `SET search_path = public`. `REVOKE` from `PUBLIC`/`anon`/
`authenticated`, `GRANT` to `service_role` — same pattern as the other RPCs.

```
admin_correct_punch(
  p_admin_id            uuid,
  p_action              text,         -- 'add' | 'modify' | 'delete'
  p_target_effective_id uuid,         -- required for modify/delete, NULL for add
  p_employee_id         uuid,         -- required for add; derived for modify/delete
  p_kind                text,         -- required for add/modify
  p_time                timestamptz,  -- required for add/modify
  p_reason              text
) RETURNS void
```

One atomic transaction, dispatched on `p_action`:

- **add** — insert a `punch_edit_requests` row (`action='add'`,
  `status='approved'`, `created_by` = `reviewed_by` = `p_admin_id`,
  `reviewed_at = now()`); insert one new `effective_punches` row sourced from it.

- **modify** — `SELECT ... FOR UPDATE` the target effective row; derive its
  `employee_id`; insert a request (`action='modify'`, `original_punch_id` =
  target's `source_punch_id`, `target_effective_id` = target); insert the new
  `effective_punches` row sourced from the request; set the target's
  `superseded_at = now()` and `superseded_by_request_id`.

- **delete** — `SELECT ... FOR UPDATE` the target; insert a request
  (`action='delete'`, recording the voided punch's `requested_kind`/
  `requested_time` so the audit shows *what* was removed); set the target
  superseded; create no new effective row.

Guards:
- Target not found → `RAISE EXCEPTION USING ERRCODE = 'P0002'` (→ 404).
- Target already superseded → `RAISE EXCEPTION USING ERRCODE = 'P0001'` (→ 409).

## 3. Edge Function — `admin-correct-punch`

`POST`. `handleCors` → `authenticate` → `requireAdmin`. Validates: `action` in
the enum; `reason` non-empty; for `add`/`modify`, `p_time` parses and is not in
the future; required fields per action present. Calls the RPC via
`adminClient()`. Maps `P0001` → 409 `ALREADY_CHANGED`, `P0002` → 404 `NOT_FOUND`.
Same structure as `approve-edit/index.ts`. Admin-only is enforced server-side,
not just by hiding UI.

## 4. Excluding superseded rows from reports

Every consumer of `effective_punches` must filter `superseded_at IS NULL`:

| Consumer | Change |
|---|---|
| `src/admin/AdminDashboard.tsx` query | add `.is('superseded_at', null)` |
| `src/employee/EmployeeHistory.tsx` query | add `.is('superseded_at', null)` |
| `src/employee/EmployeeHome.tsx` query | add `.is('superseded_at', null)` |
| `supabase/functions/export-month/index.ts` query | add `.is('superseded_at', null)` |
| `daily_worked` view | replace with `WHERE superseded_at IS NULL`, keep `security_invoker = on` |

`monthly_hours` and the CSV totals derive from `daily_worked`, so they are
covered transitively.

## 5. Frontend UI — `AdminDashboard`

- Each punch row gets a small **✎ Modify** and **🗑 Delete** action (new table
  column).
- A page-level **Add punch** button near the date/employee filters, for punches
  with no existing row.
- One `src/components/PunchCorrectionModal.tsx` with three modes:
  - `add` / `modify` share a form: kind toggle, `datetime-local` input, reason
    textarea.
  - `delete` shows the punch read-only plus a required reason field.
  - Reason is mandatory in all three modes (audit requirement).
- Rows whose source is a request (`source_request_id` set) show a subtle
  "✎ corrected" badge — visible proof of the correction trail.
- After any action, refetch the punch list. The existing realtime channel only
  listens for `INSERT`; `modify`/`delete` also `UPDATE`, so a manual refetch is
  required regardless.

## 6. Supporting changes

- `src/lib/types.ts` — extend `EffectivePunch` (`superseded_at`,
  `superseded_by_request_id`) and `PunchEditRequest` (`created_by`, `action`,
  `target_effective_id`).
- `src/lib/api.ts` — add `adminCorrectPunch(args)` wrapper.
- `src/i18n/messages.ts` — new `admin.correct.*` strings and error codes, added
  to all three languages (`zh`, `en`, `es`), per the i18n convention.

## 7. Testing

`supabase/functions/admin-correct-punch/test.ts` (Deno), following the existing
`approve-edit/test.ts` pattern:
- `add` happy path → 200, new `effective_punches` row, request `action='add'`.
- `modify` happy path → 200, new active row, old row `superseded_at` set.
- `delete` happy path → 200, target superseded, no new effective row.
- Non-admin caller → 403.
- Modify/delete of an already-superseded row → 409.

## CLAUDE.md invariants — compliance check

1. `punches` append-only/immutable — untouched. ✅
2. Punch inserts via `create_punch` — unaffected; this feature inserts only
   `effective_punches` + `punch_edit_requests`. ✅
3. Corrections go through `punch_edit_requests` — every action writes one. ✅
4. Views use `security_invoker = on` — kept when replacing `daily_worked`. ✅
5. GPS recorded not enforced — manual corrections have no GPS; expected. ✅
