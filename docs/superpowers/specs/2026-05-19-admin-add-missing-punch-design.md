# Add missing punch from the 未上班 / 未下班 chips

**Date:** 2026-05-19
**Status:** Approved

## Problem

On the admin dashboard, an incomplete shift renders an amber placeholder:

- `未下班` (openShift) — an `in` punch with no matching `out`.
- `未上班` (strayOut) — an `out` punch with no preceding `in`.

These placeholders are plain non-clickable `<span>`s. The only way for an admin
to add the missing punch is the top-level "add" button, which makes them
re-select the employee and type by hand. The admin wants to click the
placeholder directly and add exactly the punch that is missing.

## Goal

Clicking `未下班` adds the missing clock-out punch; clicking `未上班` adds the
missing clock-in punch. Employee and punch type are determined by the row, so
both are **locked** in the modal — the admin only enters time and reason.

## Approach

Add a 4th variant to `PunchCorrectionModal`'s discriminated union rather than
overloading the existing `add` mode. Each mode keeps an explicit contract.

## Changes

### `src/components/PunchCorrectionModal.tsx`

New mode in the `Props` union:

```ts
| {
    mode: 'add-missing';
    employeeId: string;
    employeeName: string;
    kind: 'in' | 'out';
    onClose: () => void;
    onDone: () => void;
  }
```

Behaviour in `add-missing` mode:

- **Title:** reuse `admin.correct.modalAddTitle`.
- **Employee:** read-only line, same style as `modify` mode (no `<select>`).
- **Type:** the existing two-button `in`/`out` group, rendered **disabled**
  with `kind` preset from props. The admin sees which type it is but cannot
  change it.
- **Time + Reason:** editable, both required. Time starts empty.
- **Submit:** `adminCorrectPunch({ action: 'add', employee_id, kind, time, reason })`
  — the same call the existing `add` mode makes.

`initialKind` derives from `props.kind` for both `modify` and `add-missing`.
The type-selector and time-input block already renders for `add` and `modify`;
extend its condition to include `add-missing`, and disable the type buttons
when `mode === 'add-missing'`.

### `src/admin/AdminDashboard.tsx`

- `ModalState`: add `| { mode: 'add-missing'; employeeId: string; employeeName: string; kind: 'in' | 'out' }`.
- Replace the two amber `<span>` placeholders (lines ~492, ~500) with
  `<button type="button">`s. Keep the amber styling; add hover/cursor
  affordance so they read as clickable.
  - `未下班` (openShift, `s.in` exists): `setModal({ mode: 'add-missing', kind: 'out', employeeId: s.in.employee_id, employeeName: s.in.employee.full_name })`.
  - `未上班` (strayOut, `s.out` exists): `setModal({ mode: 'add-missing', kind: 'in', employeeId: s.out.employee_id, employeeName: s.out.employee.full_name })`.
- Add an `add-missing` branch to the modal render switch at the bottom.

## Out of scope

- No new i18n strings — every key the modal needs (`modalAddTitle`,
  `employeeLabel`, `typeLabel`, `timeLabel`, `reasonLabel`,
  `reasonPlaceholder`, `save`, `cancel`, `punch.in`, `punch.out`) already
  exists in all three languages.
- No backend / Edge Function changes — `admin-correct-punch` already handles
  `action: 'add'`.
- Server-side validation (sequence checks, dedup) is unchanged and still
  applies.
