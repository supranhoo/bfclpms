/**
 * Pure helpers for the "Download Range" feature on KPI Scorecard Detail.
 * Periods are identified by month-name + year, matching the kpis table columns
 * (review_period, review_year).
 */

export const MAX_RANGE_MONTHS = 12;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export type MonthName = typeof MONTHS[number];

export interface PeriodPoint {
  month: MonthName;
  year: number;
}

function monthIndex(name: string): number {
  const i = MONTHS.indexOf(name as MonthName);
  if (i < 0) throw new Error(`Unknown month: ${name}`);
  return i;
}

/** Inclusive ordered list of (month, year) from `from` to `to`. Empty if reversed. */
export function enumeratePeriods(from: PeriodPoint, to: PeriodPoint): PeriodPoint[] {
  const fromOrdinal = from.year * 12 + monthIndex(from.month);
  const toOrdinal = to.year * 12 + monthIndex(to.month);
  if (toOrdinal < fromOrdinal) return [];
  const out: PeriodPoint[] = [];
  for (let o = fromOrdinal; o <= toOrdinal; o++) {
    out.push({ month: MONTHS[o % 12], year: Math.floor(o / 12) });
  }
  return out;
}

export interface RangeValidation {
  ok: boolean;
  count: number;
  error: string | null;
}

export function validateRange(from: PeriodPoint, to: PeriodPoint): RangeValidation {
  const periods = enumeratePeriods(from, to);
  if (periods.length === 0) {
    return { ok: false, count: 0, error: 'End month must be on or after start month' };
  }
  if (periods.length > MAX_RANGE_MONTHS) {
    return { ok: false, count: periods.length, error: `Range cannot exceed ${MAX_RANGE_MONTHS} months` };
  }
  return { ok: true, count: periods.length, error: null };
}