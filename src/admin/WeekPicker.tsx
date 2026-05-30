import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { addDaysKey, formatDate, formatMonthYear, formatWeekday, madridTodayKey, madridWeekStartKey } from '../lib/time';
import { monthGridWeeks } from '../lib/calendar';

type T = (key: string, vars?: Record<string, string | number>) => string;

interface Props {
  /** Monday (YYYY-MM-DD) of the currently selected week. */
  weekStart: string;
  /** Monday of the week containing today; later weeks are disabled. */
  currentWeekStart: string;
  onChange: (weekStartKey: string) => void;
  t: T;
}

const monthKeyOf = (dayKey: string) => dayKey.slice(0, 7);

/** Add `delta` calendar months to a YYYY-MM key. */
function addMonths(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const idx = (y * 12 + (m - 1)) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export default function WeekPicker({ weekStart, currentWeekStart, onChange, t }: Props) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => monthKeyOf(weekStart));
  const [hoverWeek, setHoverWeek] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  const todayKey = madridTodayKey();
  const todayMonth = monthKeyOf(todayKey);
  const weekEnd = addDaysKey(weekStart, 6);
  const weekLabel = `${formatDate(`${weekStart}T12:00:00Z`)} – ${formatDate(`${weekEnd}T12:00:00Z`)}`;
  const atCurrentWeek = weekStart >= currentWeekStart;

  // Re-sync the displayed month whenever the popover opens or the week changes
  // from the outside (e.g. the ‹ › arrows).
  useEffect(() => {
    if (open) setViewMonth(monthKeyOf(weekStart));
  }, [open, weekStart]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const weeks = useMemo(() => monthGridWeeks(viewMonth), [viewMonth]);
  const weekdayHeaders = useMemo(
    () => weeks[0].map(k => formatWeekday(`${k}T12:00:00Z`)),
    [weeks],
  );
  const canGoNextMonth = viewMonth < todayMonth;

  const pick = (dayKey: string) => {
    onChange(madridWeekStartKey(dayKey));
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative inline-flex items-center gap-1 rounded-lg bg-white ring-1 ring-slate-300 px-1 py-0.5">
      <button
        type="button"
        onClick={() => onChange(addDaysKey(weekStart, -7))}
        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
        title={t('history.weekPrev')}
        aria-label={t('history.weekPrev')}
      >
        ‹
      </button>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="px-2 h-8 inline-flex items-center text-sm font-medium text-slate-800 tabular-nums whitespace-nowrap rounded-md hover:bg-slate-100 transition"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        title={t('admin.weekPicker.open')}
      >
        {weekLabel}
      </button>

      <button
        type="button"
        onClick={() => onChange(addDaysKey(weekStart, 7))}
        disabled={atCurrentWeek}
        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
        title={t('history.weekNext')}
        aria-label={t('history.weekNext')}
      >
        ›
      </button>

      {open && (
        <div
          id={popId}
          role="dialog"
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-50 w-72 rounded-xl bg-white p-3 shadow-lg ring-1 ring-slate-200"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewMonth(m => addMonths(m, -1))}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
              title={t('admin.weekPicker.prevMonth')}
              aria-label={t('admin.weekPicker.prevMonth')}
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-slate-800 capitalize">
              {formatMonthYear(`${viewMonth}-01T12:00:00Z`)}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(m => addMonths(m, 1))}
              disabled={!canGoNextMonth}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
              title={t('admin.weekPicker.nextMonth')}
              aria-label={t('admin.weekPicker.nextMonth')}
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {weekdayHeaders.map((wd, i) => (
              <div key={i} className="h-6 flex items-center justify-center text-[11px] font-medium text-slate-400 capitalize">
                {wd}
              </div>
            ))}
          </div>

          <div onMouseLeave={() => setHoverWeek(null)}>
            {weeks.map(week => {
              const rowWeekStart = week[0];
              const rowSelected = rowWeekStart === weekStart;
              const rowHovered = hoverWeek === rowWeekStart;
              return (
                <div
                  key={rowWeekStart}
                  className={[
                    'grid grid-cols-7 gap-0.5 rounded-md',
                    rowSelected ? 'bg-emerald-100' : rowHovered ? 'bg-slate-100' : '',
                  ].join(' ')}
                >
                  {week.map(dayKey => {
                    const dayWeekStart = madridWeekStartKey(dayKey);
                    const disabled = dayWeekStart > currentWeekStart;
                    const otherMonth = monthKeyOf(dayKey) !== viewMonth;
                    const isToday = dayKey === todayKey;
                    const dayNum = Number(dayKey.slice(8, 10));
                    return (
                      <button
                        key={dayKey}
                        type="button"
                        disabled={disabled}
                        onMouseEnter={() => setHoverWeek(disabled ? null : dayWeekStart)}
                        onClick={() => pick(dayKey)}
                        className={[
                          'h-8 w-full inline-flex items-center justify-center rounded-md text-sm tabular-nums transition',
                          disabled ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-emerald-200/60',
                          rowSelected ? 'font-semibold text-emerald-900' : otherMonth ? 'text-slate-400' : 'text-slate-700',
                          isToday && !rowSelected ? 'ring-1 ring-inset ring-emerald-400' : '',
                        ].join(' ')}
                      >
                        {dayNum}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
