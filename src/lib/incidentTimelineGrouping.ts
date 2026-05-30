/**
 * Incident timeline grouping — Safety Governance Phase 3 (UI-only).
 *
 * Pure helper that buckets timeline rows by local calendar day.
 * No data fetches, no side effects, no contract changes.
 * Mirrors the legacy flat ordering when rows fall on the same day.
 */
import type { TimelineRow } from '@/hooks/useSafetyIncidentDetail';

export interface TimelineDayGroup {
  /** ISO date key (YYYY-MM-DD in the viewer's local timezone). */
  dayKey: string;
  /** Date object pinned to local midnight for header formatting. */
  date: Date;
  rows: TimelineRow[];
}

function localDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Group timeline rows by local calendar day, preserving the input order
 * within each day. Returns groups sorted ascending by day (oldest first),
 * matching the existing IncidentTimeline render order.
 */
export function groupTimelineByDay(rows: TimelineRow[]): TimelineDayGroup[] {
  const buckets = new Map<string, TimelineDayGroup>();
  for (const row of rows) {
    const key = localDayKey(row.created_at);
    let g = buckets.get(key);
    if (!g) {
      const d = new Date(row.created_at);
      g = { dayKey: key, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), rows: [] };
      buckets.set(key, g);
    }
    g.rows.push(row);
  }
  return Array.from(buckets.values()).sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

/**
 * Decide which day groups should be collapsed by default — anything
 * older than `daysAgo` (default 7) from `now`.
 */
export function isGroupCollapsedByDefault(
  group: TimelineDayGroup,
  now: Date = new Date(),
  daysAgo = 7,
): boolean {
  const ms = now.getTime() - group.date.getTime();
  return ms > daysAgo * 24 * 60 * 60 * 1000;
}