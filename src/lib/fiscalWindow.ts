/**
 * Canonical fiscal-window guard for BFCL PMS reports.
 *
 * The fiscal year runs Jul(Y) .. Jun(Y+1). Any time-series report or
 * aggregator that fetches `kpis` / `review_submissions` / etc. across
 * two calendar years for a single fiscal cycle MUST pair `review_period`
 * with `review_year` before bucketing. Otherwise rows from an adjacent
 * fiscal cycle bleed into the wrong months.
 *
 * Reference: POLICY.md §90b, BUG-044 (KPI Mapping Matrix), BUG-045
 * (Annual Review archetype counter), BUG-046 (Multi-month percolation
 * cross-year siblings).
 */

/** Calendar-order month names as they appear in `kpis.review_period`. */
export const CALENDAR_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export type MonthName = typeof CALENDAR_MONTHS[number];

/**
 * Given a KPI's month name and the selected fiscal cycle's start year,
 * return the calendar year that month should carry inside that cycle.
 *   Jul–Dec  → fiscalStartYear
 *   Jan–Jun  → fiscalStartYear + 1
 * Returns `null` when the month name is not recognised.
 */
export function fiscalYearForMonth(
  reviewPeriod: string | null | undefined,
  fiscalStartYear: number,
): number | null {
  if (!reviewPeriod) return null;
  const idx = CALENDAR_MONTHS.indexOf(reviewPeriod as MonthName);
  if (idx === -1) return null;
  return idx >= 6 ? fiscalStartYear : fiscalStartYear + 1;
}

/**
 * True when the (period, year) tuple falls inside fiscal cycle `fiscalStartYear`.
 */
export function isFiscalTuple(
  reviewPeriod: string | null | undefined,
  reviewYear: number | null | undefined,
  fiscalStartYear: number,
): boolean {
  if (reviewYear == null) return false;
  const expected = fiscalYearForMonth(reviewPeriod, fiscalStartYear);
  return expected != null && expected === reviewYear;
}

/**
 * Calendar-month-index (0-based Jan=0) variant, matching the signature used
 * by the KPI Mapping Matrix's `isKpiMonthInFiscalCycle` guard.
 */
export function isKpiMonthInFiscalCycle(
  calMonthIdx: number,
  reviewYear: number | null | undefined,
  fiscalStartYear: number,
): boolean {
  if (reviewYear == null) return false;
  return calMonthIdx >= 6
    ? reviewYear === fiscalStartYear
    : reviewYear === fiscalStartYear + 1;
}

/**
 * Filter a list of time-series rows down to those inside the selected
 * fiscal cycle. `getPeriod`/`getYear` accessors let it operate on any
 * row shape (raw kpis rows, joined submissions, RPC payloads, etc.).
 */
export function filterToFiscalWindow<T>(
  rows: readonly T[],
  fiscalStartYear: number,
  getPeriod: (row: T) => string | null | undefined,
  getYear: (row: T) => number | null | undefined,
): T[] {
  return rows.filter(r => isFiscalTuple(getPeriod(r), getYear(r), fiscalStartYear));
}

/**
 * Convert a KPI's own `(period, year)` back to its owning fiscal start year.
 * Jul–Dec KPIs → year; Jan–Jun KPIs → year − 1.
 * Returns `null` when either input is missing/invalid.
 */
export function fiscalStartYearOfKpi(
  reviewPeriod: string | null | undefined,
  reviewYear: number | null | undefined,
): number | null {
  if (reviewYear == null || !reviewPeriod) return null;
  const idx = CALENDAR_MONTHS.indexOf(reviewPeriod as MonthName);
  if (idx === -1) return null;
  return idx >= 6 ? reviewYear : reviewYear - 1;
}