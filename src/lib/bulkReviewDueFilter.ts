/**
 * Bulk Review — "Hide non-due KPIs" filter helper.
 *
 * Multi-month KPIs (Bi-Monthly / Quarterly / Half-Yearly / Yearly) materialise
 * sibling placeholder rows in every cycle month (see
 * mem://architecture/pms/multimonth-percolation). Only the cycle's terminal
 * (anchor) month is actually actionable; the rest show as `PENDING` and
 * confuse reviewers in the Bulk Review matrix.
 *
 * This pure helper decides whether a given row is "due" in the selected
 * (period, year) — i.e. whether the selected month IS the cycle anchor for
 * that row's frequency. Used to filter the Bulk Review snapshot client-side
 * with a user-toggleable override.
 *
 * Daily / Weekly / Monthly are always due (single-month cycles). Daily is
 * already excluded by the snapshot RPC; we still return `true` defensively.
 *
 * Read-time defaulting note (POLICY §128): when `frequency_cycle_start` is
 * missing we DO apply the cascading default (first option of
 * `getCycleOptionsForFrequency`) — POLICY §128 governs write paths, not
 * read-time UI filters. Returning `true` here unconditionally would mask
 * almost every non-conforming multi-month row and silently break the filter
 * (Jitendra RCA, Jun 2026).
 */
import { isKpiLockedForPeriod, normalizeFrequency, getCycleMonths, getMonthNumber } from '@/lib/frequencyUtils';

export interface DueFilterRow {
  frequency: string | null;
  frequency_cycle_start?: string | null;
}

export function isRowDueInPeriod(
  row: DueFilterRow,
  period: string,
  year: number,
): boolean {
  const freq = normalizeFrequency(row.frequency);
  if (!freq) return true; // Unknown / null frequency → treat as due (safe default)
  if (freq === 'Daily' || freq === 'Weekly' || freq === 'Monthly') return true;

  // Multi-month: a row is "due" iff the selected month IS the cycle's
  // active/anchor month. Two checks are required:
  //   (1) the selected month belongs to this KPI's cycle at all, and
  //   (2) within that cycle, the month is NOT a locked (sibling) month.
  // Step (1) closes a gap where `isKpiLockedForPeriod` reports months
  // entirely outside the cycle as "not locked" (e.g. April for a
  // Half-Yearly May-Oct row), which would otherwise be treated as due.
  const cycleStart = row.frequency_cycle_start || undefined;
  const cycleMonths = getCycleMonths(freq, period, year, cycleStart);
  if (!cycleMonths.includes(period)) return false;
  return !isKpiLockedForPeriod(freq, period, year, cycleStart);
}

// Re-export for caller convenience (kept to avoid an extra import surface).
export { getMonthNumber };