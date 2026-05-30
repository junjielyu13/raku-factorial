// src/employee/EmployeeHistory.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { formatDate, formatWeekday, formatTime, madridDayKeyOf, madridDayRange, madridTodayKey, madridWeekStartKey, madridWeekRange, addDaysKey, madridLastNDaysStart } from '../lib/time';
import { pairShifts, msToHm } from '../lib/worked';
import type { ShiftPair } from '../lib/worked';
import { useTranslation } from '../i18n/LanguageContext';
import type { EffectivePunch } from '../lib/types';
import { EditRequestModal } from '../components/EditRequestModal';
import type { EditTarget } from '../components/EditRequestModal';

type Filter = 'last7' | 'last30' | 'week' | 'day';

const PAGE_SIZES = [10, 50, 100] as const;
type PageSize = typeof PAGE_SIZES[number];

// Minimal pending-request shape for the inline overlay on history rows.
interface PendingReq {
  id: string;
  action: 'add' | 'modify' | 'delete';
  requested_kind: 'in' | 'out';
  requested_time: string;
  target_effective_id: string | null;
}

type Tfn = (key: string, vars?: Record<string, string | number>) => string;

// One pending marker per time box. Holds its own open/closed state so each
// side (in / out) toggles independently. The fragment hangs in a popover so
// expanding doesn't push the time row layout.
function PendingMarker({
  pending,
  isAdd,
  t,
}: {
  pending: PendingReq;
  isAdd: boolean;
  t: Tfn;
}) {
  const [open, setOpen] = useState(false);
  let fragment: string;
  if (isAdd) fragment = `+ ${formatTime(pending.requested_time)}`;
  else if (pending.action === 'modify') fragment = `→ ${formatTime(pending.requested_time)}`;
  else fragment = t('history.deleteLabel');
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title={t('history.pendingToggle')}
        aria-label={t('history.pendingToggle')}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-md text-xs transition ${
          open ? 'bg-amber-200 text-amber-900' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
        }`}
      >
        ⏳
      </button>
      {open && (
        <span className="absolute left-0 top-full mt-1 px-2 py-1 rounded-md bg-amber-100 text-amber-800 text-xs font-mono tabular-nums whitespace-nowrap ring-1 ring-amber-200 shadow-sm z-10">
          {fragment}
        </span>
      )}
    </div>
  );
}

// One shift row: 3-column grid with row 1 = time pair (or stray/open chip),
// row 2 = per-side pending icons aligned under each time box.
function ShiftRow({
  s,
  t,
  pendingByTarget,
  pendingAddByDayKind,
  onModify,
  onAdd,
  onDelete,
}: {
  s: ShiftPair<EffectivePunch>;
  t: Tfn;
  pendingByTarget: Map<string, PendingReq>;
  pendingAddByDayKind: Map<string, PendingReq>;
  onModify: (p: EffectivePunch) => void;
  onAdd: (kind: 'in' | 'out') => void;
  onDelete: (targets: EditTarget[]) => void;
}) {
  // Pending request relevant to each side: modify/delete on a present punch,
  // or a pending add filling in the missing punch of an incomplete shift.
  const inPending  = s.in  ? pendingByTarget.get(s.in.id)  ?? null : (pendingAddByDayKind.get(`${s.date}|in`)  ?? null);
  const outPending = s.out ? pendingByTarget.get(s.out.id) ?? null : (pendingAddByDayKind.get(`${s.date}|out`) ?? null);
  const rowTargets: EditTarget[] = [
    ...(s.in ? [{ effective_id: s.in.id, kind: s.in.kind, effective_time: s.in.effective_time }] : []),
    ...(s.out ? [{ effective_id: s.out.id, kind: s.out.kind, effective_time: s.out.effective_time }] : []),
  ];

  const timeBoxBase = 'inline-flex items-center px-3 py-1.5 rounded-md bg-white ring-1 ring-slate-200 font-mono tabular-nums text-slate-900 text-sm hover:bg-slate-50 hover:ring-emerald-400 transition';
  const addChipBase = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200 transition';

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="grid grid-cols-[auto_auto_auto] gap-x-2 gap-y-1 items-center">
          {/* Row 1: time pair */}
          {s.in ? (
            <button type="button" onClick={() => onModify(s.in!)} className={timeBoxBase} title={t('editRequest.requestModifyTitle')}>
              {formatTime(s.in.effective_time)}
            </button>
          ) : (
            <button type="button" onClick={() => onAdd('in')} className={addChipBase} title={t('editRequest.requestAddTitle')}>
              ❓ {t('admin.shifts.strayOut')}
            </button>
          )}
          <span className="text-slate-400 px-1">–</span>
          {s.out ? (
            <button type="button" onClick={() => onModify(s.out!)} className={timeBoxBase} title={t('editRequest.requestModifyTitle')}>
              {formatTime(s.out.effective_time)}
            </button>
          ) : (
            <button type="button" onClick={() => onAdd('out')} className={addChipBase} title={t('editRequest.requestAddTitle')}>
              ❓ {t('admin.shifts.openShift')}
            </button>
          )}

          {/* Row 2: per-side pending markers (only when at least one exists). */}
          {(inPending || outPending) && (
            <>
              <div className="justify-self-start">
                {inPending && <PendingMarker pending={inPending} isAdd={!s.in} t={t} />}
              </div>
              <span />
              <div className="justify-self-start">
                {outPending && <PendingMarker pending={outPending} isAdd={!s.out} t={t} />}
              </div>
            </>
          )}
        </div>
        {rowTargets.length > 0 && (
          <button
            type="button"
            onClick={() => onDelete(rowTargets)}
            className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
            title={t('editRequest.requestDeleteTitle')}
            aria-label={t('editRequest.requestDeleteTitle')}
          >
            ✕
          </button>
        )}
      </div>
    </li>
  );
}

export function EmployeeHistory() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [rows, setRows] = useState<EffectivePunch[]>([]);
  const [pending, setPending] = useState<PendingReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('week');
  const [selectedDate, setSelectedDate] = useState<string>(madridTodayKey());
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(() => madridWeekStartKey(madridTodayKey()));
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState(0);
  type ModalState =
    | { mode: 'modify'; target: EditTarget }
    | { mode: 'delete'; targets: EditTarget[] }
    | { mode: 'add'; kind?: 'in' | 'out'; date?: string };
  const [modal, setModal] = useState<ModalState | null>(null);

  const load = useCallback(() => {
    if (!profile) return;
    setLoading(true);

    let q = supabase.from('effective_punches').select('*')
      .eq('employee_id', profile.id)
      .is('superseded_at', null);

    if (filter === 'day') {
      const { start, end } = madridDayRange(selectedDate);
      q = q.gte('effective_time', start).lt('effective_time', end);
    } else if (filter === 'week') {
      const { start, end } = madridWeekRange(selectedWeekStart);
      q = q.gte('effective_time', start).lt('effective_time', end);
    } else {
      const days = filter === 'last7' ? 7 : 30;
      q = q.gte('effective_time', madridLastNDaysStart(days));
    }

    q.order('effective_time', { ascending: true })
      .then(({ data }) => { setRows((data as EffectivePunch[]) ?? []); setLoading(false); });

    supabase.from('punch_edit_requests')
      .select('id, action, requested_kind, requested_time, target_effective_id')
      .eq('employee_id', profile.id)
      .eq('status', 'pending')
      .then(({ data }) => setPending((data as PendingReq[]) ?? []));
  }, [profile, filter, selectedDate, selectedWeekStart]);

  useEffect(() => { load(); }, [load]);

  // Reset to first page when filter, date, week, or page size changes.
  useEffect(() => { setPage(0); }, [filter, selectedDate, selectedWeekStart, pageSize]);

  const todayKey = madridTodayKey();
  const shifts = useMemo(() => pairShifts(rows), [rows]);

  // Lookup maps for inline pending overlays.
  //   pendingByTarget — modify/delete keyed by target_effective_id (one per
  //     target thanks to server-side supersede semantics).
  //   pendingAddByDayKind — pending adds bucketed by Madrid day + kind so an
  //     incomplete shift can show "⏳ 申请新增 HH:MM" instead of "Sin entrada".
  const { pendingByTarget, pendingAddByDayKind } = useMemo(() => {
    const byTarget = new Map<string, PendingReq>();
    const byDayKind = new Map<string, PendingReq>();
    for (const r of pending) {
      if (r.action === 'add') {
        byDayKind.set(`${madridDayKeyOf(r.requested_time)}|${r.requested_kind}`, r);
      } else if (r.target_effective_id) {
        byTarget.set(r.target_effective_id, r);
      }
    }
    return { pendingByTarget: byTarget, pendingAddByDayKind: byDayKind };
  }, [pending]);

  // Per-day totals from the FULL shift set so they don't change as you paginate.
  const dayTotalsMs = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shifts) {
      let ms = 0;
      if (s.in && s.out) {
        ms = new Date(s.out.effective_time).getTime() - new Date(s.in.effective_time).getTime();
      } else if (s.isOpen && s.in && s.date === todayKey) {
        ms = Math.max(0, Date.now() - new Date(s.in.effective_time).getTime());
      }
      m.set(s.date, (m.get(s.date) ?? 0) + ms);
    }
    return m;
  }, [shifts, todayKey]);

  const rangeTotal = msToHm(Array.from(dayTotalsMs.values()).reduce((a, b) => a + b, 0));

  const totalPages = Math.max(1, Math.ceil(shifts.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pagedShifts = shifts.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // Group paginated shifts by day for rendering (day totals stay from full set).
  const grouped = useMemo(() => {
    const m = new Map<string, ShiftPair<EffectivePunch>[]>();
    for (const s of pagedShifts) {
      if (!m.has(s.date)) m.set(s.date, []);
      m.get(s.date)!.push(s);
    }
    return Array.from(m.entries());
  }, [pagedShifts]);

  // Week-picker derived values (cheap; computed each render).
  const currentWeekStart = madridWeekStartKey(todayKey);
  const weekRange = madridWeekRange(selectedWeekStart);
  const weekLabel = `${formatDate(`${weekRange.startKey}T12:00:00Z`)} – ${formatDate(`${weekRange.endKey}T12:00:00Z`)}`;

  return (
    <div className="min-h-full max-w-md mx-auto px-4 py-6 space-y-4">
      <Link to="/" className="inline-block text-sm text-emerald-700 hover:underline">{t('common.back')}</Link>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">{t('history.title')}</h1>
        <div className="flex items-center gap-2 shrink-0">
          <Link to="/my-requests" className="app-btn-ghost">
            {t('myRequests.button')}
          </Link>
          <Link to="/submit-edit" className="app-btn-ghost">
            {t('home.submitEdit')}
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          {(['week', 'last7', 'last30', 'day'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`py-2 rounded-md text-sm font-medium transition ${filter === f ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}
            >
              {t(`history.filter.${f}`)}
            </button>
          ))}
        </div>
        {filter === 'day' && (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t('history.pickDate')}</span>
            <input
              type="date"
              value={selectedDate}
              max={madridTodayKey()}
              onChange={e => {
                const v = e.target.value;
                if (v && v > madridTodayKey()) return;
                setSelectedDate(v);
              }}
              className="app-input"
            />
          </label>
        )}
        {filter === 'week' && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-white ring-1 ring-slate-200 px-2 py-1.5">
            <button
              type="button"
              onClick={() => setSelectedWeekStart(w => addDaysKey(w, -7))}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
              title={t('history.weekPrev')}
              aria-label={t('history.weekPrev')}
            >
              ‹
            </button>
            <span className="text-sm font-medium text-slate-800 tabular-nums">{weekLabel}</span>
            <button
              type="button"
              onClick={() => setSelectedWeekStart(w => addDaysKey(w, 7))}
              disabled={selectedWeekStart >= currentWeekStart}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
              title={t('history.weekNext')}
              aria-label={t('history.weekNext')}
            >
              ›
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="app-card px-4 py-6 text-center text-slate-500 text-sm">{t('common.loading')}</div>
      ) : shifts.length === 0 ? (
        <div className="app-card px-4 py-6 text-center text-slate-500 text-sm">{t('history.noRecords')}</div>
      ) : (
        <div className="space-y-3">
          {filter !== 'day' && (
            <div className="app-card px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-slate-600">{filter === 'week' ? weekLabel : t(`history.filter.${filter}`)}</span>
              <span className="text-sm font-semibold text-slate-900 tabular-nums">
                {t('history.rangeTotal', { h: rangeTotal.h, m: rangeTotal.m })}
              </span>
            </div>
          )}
          {grouped.map(([date, dayShifts]) => {
            const dayHm = msToHm(dayTotalsMs.get(date) ?? 0);
            const dayAnchor = dayShifts[0].in ?? dayShifts[0].out!;
            return (
              <div key={date} className="app-card overflow-hidden">
                <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/60">
                  <div className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                    <span>{formatDate(dayAnchor.effective_time)}</span>
                    <span className="ml-1 font-normal text-slate-500">{formatWeekday(dayAnchor.effective_time)}</span>
                    <button
                      type="button"
                      onClick={() => setModal({ mode: 'add', date })}
                      className="ml-1 h-6 w-6 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
                      title={t('editRequest.requestAddTitle')}
                      aria-label={t('editRequest.requestAddTitle')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-slate-700">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-slate-500" aria-hidden="true">
                      <circle cx="12" cy="13" r="8" />
                      <path d="M12 9v4l2 2" />
                      <path d="M9 2h6" />
                    </svg>
                    <span className="font-mono tabular-nums">{t('admin.stats.hours', { h: dayHm.h, m: dayHm.m })}</span>
                  </div>
                </header>
                <ul className="divide-y divide-slate-100">
                  {dayShifts.map((s, idx) => (
                    <ShiftRow
                      key={`${(s.in ?? s.out!).id}-${idx}`}
                      s={s}
                      t={t}
                      pendingByTarget={pendingByTarget}
                      pendingAddByDayKind={pendingAddByDayKind}
                      onModify={(p) => setModal({ mode: 'modify', target: { effective_id: p.id, kind: p.kind, effective_time: p.effective_time } })}
                      onAdd={(kind) => setModal({ mode: 'add', kind })}
                      onDelete={(targets) => setModal({ mode: 'delete', targets })}
                    />
                  ))}
                </ul>
              </div>
            );
          })}

          <div className="app-card px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-sm">
            <label className="flex items-center gap-2">
              <span className="text-slate-600">{t('common.pagination.perPage')}</span>
              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value) as PageSize)}
                className="px-2 py-1 rounded-md bg-white ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {PAGE_SIZES.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={safePage <= 0}
                className="px-3 py-1 rounded-md ring-1 ring-slate-300 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                {t('common.pagination.prev')}
              </button>
              <span className="text-xs text-slate-500 tabular-nums min-w-max">
                {t('common.pagination.pageOf', { page: safePage + 1, total: totalPages })}
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="px-3 py-1 rounded-md ring-1 ring-slate-300 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                {t('common.pagination.next')}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (modal.mode === 'modify' ? (
        <EditRequestModal
          mode="modify"
          target={modal.target}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load(); }}
        />
      ) : modal.mode === 'add' ? (
        <EditRequestModal
          mode="add"
          kind={modal.kind}
          defaultDate={modal.date}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load(); }}
        />
      ) : (
        <EditRequestModal
          mode="delete"
          targets={modal.targets}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load(); }}
        />
      ))}
    </div>
  );
}
