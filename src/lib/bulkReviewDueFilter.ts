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
 */
import { isKpiLockedForPeriod, normalizeFrequency } from '@/lib/frequencyUtils';

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

  // Multi-month: cycle-start is required to disambiguate (e.g. Jan-Feb vs
  // Feb-Mar Bi-Monthly). Per POLICY §128 we do NOT silently default — if the
  // field is missing we treat the row as due so the user is never wrongly
  // hidden from work they need to do.
  if (!row.frequency_cycle_start) return true;

  // The KPI is "due" exactly when the selected period is NOT a locked
  // (sibling) month for its cycle.
  return !isKpiLockedForPeriod(freq, period, year, row.frequency_cycle_start);
}