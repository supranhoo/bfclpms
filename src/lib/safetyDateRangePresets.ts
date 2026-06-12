/**
 * Safety Date Range Presets — Phase 5.
 * -----------------------------------
 * Pure helpers that resolve a preset key into a UTC ISO `[from, to]`
 * range suitable for Supabase `.gte / .lte` on a timestamp column.
 *
 * Week starts on Monday (ISO-8601). All resolutions are computed in the
 * caller's local timezone but emitted as inclusive `YYYY-MM-DDTHH:mm:ss.sssZ`
 * strings — server treats them as absolute instants.
 *
 * Reusable across other Safety pages (audits, permits, drills) — do NOT
 * inline calendar math anywhere else.
 */

export type DateRangePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'custom';

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  all: 'All time',
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  last_week: 'Last week',
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  last_quarter: 'Last quarter',
  this_year: 'This year',
  last_year: 'Last year',
  custom: 'Custom range',
};

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfMondayWeek(d: Date): Date {
  const x = startOfDay(d);
  const dow = x.getDay(); // 0=Sun..6=Sat
  const diff = (dow + 6) % 7; // distance to Monday
  return addDays(x, -diff);
}
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0); }
function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }
function startOfQuarter(d: Date): Date {
  const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qStartMonth, 1, 0, 0, 0, 0);
}
function endOfQuarter(d: Date): Date {
  const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qStartMonth + 3, 0, 23, 59, 59, 999);
}
function startOfYear(d: Date): Date { return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0); }
function endOfYear(d: Date): Date { return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999); }

export interface ResolvedRange { from: string | null; to: string | null }

/**
 * Resolve a preset to absolute ISO instants.
 * `custom` returns the supplied `customFrom`/`customTo` (treated as local
 * dates that get expanded to the full day). `all` returns nulls (no filter).
 */
export function resolveDateRange(
  preset: DateRangePreset,
  opts: { now?: Date; customFrom?: string | null; customTo?: string | null } = {},
): ResolvedRange {
  const now = opts.now ?? new Date();
  switch (preset) {
    case 'all':
      return { from: null, to: null };
    case 'today':
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    case 'yesterday': {
      const y = addDays(now, -1);
      return { from: startOfDay(y).toISOString(), to: endOfDay(y).toISOString() };
    }
    case 'this_week': {
      const s = startOfMondayWeek(now);
      return { from: s.toISOString(), to: endOfDay(addDays(s, 6)).toISOString() };
    }
    case 'last_week': {
      const s = addDays(startOfMondayWeek(now), -7);
      return { from: s.toISOString(), to: endOfDay(addDays(s, 6)).toISOString() };
    }
    case 'this_month':
      return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() };
    case 'last_month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: startOfMonth(prev).toISOString(), to: endOfMonth(prev).toISOString() };
    }
    case 'this_quarter':
      return { from: startOfQuarter(now).toISOString(), to: endOfQuarter(now).toISOString() };
    case 'last_quarter': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return { from: startOfQuarter(prev).toISOString(), to: endOfQuarter(prev).toISOString() };
    }
    case 'this_year':
      return { from: startOfYear(now).toISOString(), to: endOfYear(now).toISOString() };
    case 'last_year': {
      const prev = new Date(now.getFullYear() - 1, 0, 1);
      return { from: startOfYear(prev).toISOString(), to: endOfYear(prev).toISOString() };
    }
    case 'custom': {
      const from = opts.customFrom ? startOfDay(new Date(opts.customFrom)).toISOString() : null;
      const to = opts.customTo ? endOfDay(new Date(opts.customTo)).toISOString() : null;
      return { from, to };
    }
  }
}

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  'all',
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_year',
  'custom',
];