# Weekly hours target + calendar week picker — design

Date: 2026-05-30
Area: Admin punch-records dashboard (`src/admin/AdminDashboard.tsx`)

## Motivation

The admin "工时统计 / Hours worked" card shows a worked total per employee, but
there's no reference to the contractual weekly target (41 h/week). Admins want to
see at a glance whether someone is under or over the weekly limit. Separately,
the "某一周 / A week" range can only be navigated with `‹ ›` arrows, which is slow
for jumping to a distant week.

## Feature 1 — weekly target `/ 41 小时` + over indicator

- Constant `WEEKLY_TARGET_HOURS = 41` (2460 min) in `AdminDashboard.tsx`.
- Displayed **only when `rangeFilter === 'week'`** (a Mon–Sun aligned week is the
  only range where comparing to a 41 h/week target is meaningful).
  - **Each per-employee row** in the stats card: render the worked time followed
    by ` / 41 小时`, and a ⚠️ when that employee's worked minutes exceed 2460.
  - **Grand total (合计) row**: render ` / 41 小时` + ⚠️ **only when a single
    employee is filtered** (`filterEmployeeId !== 'all'`). Summing several
    employees against one 41 h target is meaningless, so the suffix is hidden
    when "all" is selected.
- All other ranges (day / last7 / last30 / custom) are unchanged.
- i18n (zh/en/es): add
  - `admin.stats.targetSuffix` — `/ {h} 小时` · `/ {h}h` · `/ {h} h`
  - `admin.stats.overTarget` — ⚠️ `title` tooltip (`超出每周工时` etc.)

## Feature 2 — calendar week picker

- New focused component `src/admin/WeekPicker.tsx` owns the entire week control,
  keeping the 900-line dashboard from growing.
  - Keeps the `‹ ›` quick-step buttons (prev/next week; next disabled at the
    current week).
  - The center **week label is a button** that toggles a **month-grid popover**.
  - Popover behaviour:
    - Monday-first month grid with `‹ ›` month navigation.
    - Hovering a day highlights its whole Mon–Sun week.
    - Clicking any day selects that day's week (`madridWeekStartKey(dayKey)`).
    - The currently selected week stays highlighted.
    - Weeks beyond the current week are disabled (no future punches possible).
    - Closes on select / outside-click / Esc.
- Pure helper `monthGridWeeks(viewMonthKey)` in `src/lib/calendar.ts` returns
  `string[][]` (weeks of `YYYY-MM-DD` day-keys, Mon-first, padded to full weeks),
  unit-tested with vitest.
- Display helper `formatMonthYear(iso)` added to `src/lib/time.ts` (same locale +
  Europe/Madrid convention as the other formatters).
- `AdminDashboard` swaps its inline week block for
  `<WeekPicker weekStart={selectedWeekStart} currentWeekStart={currentWeekStart} onChange={setSelectedWeekStart} t={t} />`.
- Reuses `madridWeekStartKey` / `addDaysKey` / `formatDate`; no calendar library.

## Out of scope

- Per-employee configurable targets (target is a fixed 41 h constant).
- Target display in non-week ranges.
```
