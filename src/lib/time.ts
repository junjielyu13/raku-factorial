// src/lib/time.ts
// Locale is set by i18n LanguageProvider via setLocale(). All display formatters
// use whatever locale is currently active. Timezone is always Europe/Madrid.

let currentLocale = 'es-ES';

export function setLocale(locale: string): void {
  currentLocale = locale;
}

function dateFmt() {
  return new Intl.DateTimeFormat(currentLocale, {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  });
}
function timeFmt() {
  return new Intl.DateTimeFormat(currentLocale, {
    timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}
function dtFmt() {
  return new Intl.DateTimeFormat(currentLocale, {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export const formatDate = (iso: string) => dateFmt().format(new Date(iso));
export const formatTime = (iso: string) => timeFmt().format(new Date(iso));
export const formatDateTime = (iso: string) => dtFmt().format(new Date(iso));

export function currentMonthKey(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  return `${y}-${m}`;
}

/**
 * Returns the ISO timestamps for [start, end) of "today" in Europe/Madrid,
 * correctly handling CET/CEST DST.
 */
export function madridTodayRange(): { start: string; end: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => +parts.find(p => p.type === t)!.value;
  const y = get('year'), m = get('month'), d = get('day');
  const hh = get('hour'), mm = get('minute'), ss = get('second');

  const asIfUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  const offsetMs = asIfUtc - now.getTime();

  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs);
  const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}
