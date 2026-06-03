/**
 * Pure helpers for Platform Settings → Telemetry tab (Phase 2E).
 * No Supabase, no React — easy to unit test.
 */

export interface DailyBucket {
  date: string; // YYYY-MM-DD
  count: number;
}

/** Inclusive day bounds expressed as ISO bookends. */
export interface RangeISO {
  fromISO: string;
  untilISO: string;
}

/** Zero-fill daily buckets between two YYYY-MM-DD dates (inclusive). */
export function bucketByDay(
  rows: Array<{ created_at: string }>,
  fromDate: string,
  untilDate: string,
): DailyBucket[] {
  const start = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${untilDate}T00:00:00.000Z`);
  const days: DailyBucket[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  const idx = new Map(days.map((b, i) => [b.date, i] as const));
  for (const r of rows) {
    const day = (r.created_at ?? '').slice(0, 10);
    const i = idx.get(day);
    if (i !== undefined) days[i].count++;
  }
  return days;
}

/** Aggregate by pathname in `after.pathname`. Missing/blank → "Not captured". */
export function aggregateByPathname(
  rows: Array<{ after?: Record<string, unknown> | null }>,
): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const raw = r.after?.pathname;
    const k = typeof raw === 'string' && raw.trim() ? raw : 'Not captured';
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

/** YYYY-MM-DD in local time (matches the date inputs used by the UI). */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type PresetKey = 'today' | 'last7' | 'last30';

/** Preset date ranges for filter chips. */
export function presetRange(preset: PresetKey, now: Date = new Date()): { from: string; until: string } {
  const until = ymd(now);
  if (preset === 'today') return { from: until, until };
  const days = preset === 'last7' ? 6 : 29;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { from: ymd(start), until };
}

/** Default filter snapshot — used by "Clear all filters". */
export interface TelemetryFilters {
  from: string;
  until: string;
  clientId: string;
  moduleKey: string;
  risk: string;
  actionSearch: string;
  userSearch: string;
  routeFilter: string;
}

export function defaultFilters(now: Date = new Date()): TelemetryFilters {
  const { from, until } = presetRange('last30', now);
  return {
    from,
    until,
    clientId: 'all',
    moduleKey: 'all',
    risk: 'all',
    actionSearch: '',
    userSearch: '',
    routeFilter: '',
  };
}