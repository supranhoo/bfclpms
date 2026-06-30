/**
 * ADR-091 — pure mirror of the DB trigger
 * `public.enforce_intra_year_cycle_anchor_consistency()`.
 *
 * Used by the regression test to lock the invariant client-side. Keep this
 * in lock-step with `public.expand_cycle_window_months` and the trigger
 * predicate.
 */

const ABBREV = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;
const FULL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
] as const;

const MULTI = new Set(['Bi-Monthly','Quarterly','Half-Yearly','Yearly']);

function cycleLen(frequency: string): number {
  switch (frequency.trim()) {
    case 'Bi-Monthly': return 2;
    case 'Quarterly': return 3;
    case 'Half-Yearly': return 6;
    case 'Yearly': return 12;
    default: return 1;
  }
}

export function expandCycleWindowMonths(frequency: string, anchor: string | null): string[] {
  if (!anchor || !frequency) return [];
  const len = cycleLen(frequency);
  if (len <= 1) return [];
  const startAbbr = anchor.split('-')[0];
  const startIdx = ABBREV.indexOf(startAbbr as typeof ABBREV[number]);
  if (startIdx < 0) return [];
  const out: string[] = [];
  for (let i = 0; i < len; i++) out.push(FULL[(startIdx + i) % 12]);
  return out;
}

export interface KpiRow {
  employee_id: string;
  kpi_name: string;
  review_year: number;
  review_period: string;
  frequency: string;
  frequency_cycle_start: string | null;
}

/**
 * Returns the conflicting existing anchor if the insert must be rejected,
 * otherwise null.
 */
export function checkCycleAnchorConflict(
  next: KpiRow,
  existing: KpiRow[],
): string | null {
  if (!next.frequency_cycle_start || !MULTI.has(next.frequency)) return null;
  const windowMonths = expandCycleWindowMonths(next.frequency, next.frequency_cycle_start);
  if (windowMonths.length === 0) return null;

  for (const row of existing) {
    if (row.employee_id !== next.employee_id) continue;
    if (row.kpi_name !== next.kpi_name) continue;
    if (row.review_year !== next.review_year) continue;
    if (row.frequency !== next.frequency) continue;
    if (!row.frequency_cycle_start) continue;
    if (row.frequency_cycle_start === next.frequency_cycle_start) continue;
    if (!windowMonths.includes(row.review_period)) continue;
    return row.frequency_cycle_start;
  }
  return null;
}