/**
 * Multi-month KPI sibling assignment helper.
 *
 * When an admin assigns a multi-month KPI (Bi-Monthly / Quarterly /
 * Half-Yearly / Yearly), the workflow-bearing row is created at the cycle's
 * terminal month. To make the KPI visible to the employee in every month of
 * the cycle (and so that monthly weighted-score calculations include it as
 * "pending" rather than "missing"), placeholder sibling rows are also
 * created for the remaining cycle months, scoped to:
 *
 *   - months >= the admin-selected `assignedMonth` (past months untouched)
 *   - excluding the terminal month itself (created separately)
 *
 * Lock filtering against `review_period_locks` happens in the caller, where
 * we have async DB access. This module is pure and unit-testable.
 */

import { MULTI_MONTH_FREQUENCIES } from './frequencyCycleOptions';
import {
  MONTHS,
  buildCycleScopeLabel,
  getActiveMonthForCycle,
  getMonthNumber,
} from './frequencyUtils';

export interface SiblingPeriod {
  period: string;
  year: number;
}

export interface BuildSiblingPeriodsInput {
  frequency: string | null | undefined;
  frequencyCycleStart?: string | null;
  /** Month admin picked in "Effective Month" — past months earlier than this are skipped. */
  assignedMonth: string;
  /** Year admin picked in "Year". */
  reviewYear: number;
}

export interface BuildSiblingPeriodsResult {
  isMultiMonth: boolean;
  terminal: SiblingPeriod;
  siblings: SiblingPeriod[];
  /** All forward-open cycle months including the terminal — useful for UI hints. */
  allForwardMonths: SiblingPeriod[];
}

/**
 * Compute terminal + sibling placeholder periods for a multi-month KPI assignment.
 *
 * For non-multi-month frequencies (Daily/Weekly/Monthly), `siblings` is empty
 * and `terminal` mirrors the assigned month — callers should treat the result
 * as a no-op extension.
 */
export function buildSiblingPeriods(input: BuildSiblingPeriodsInput): BuildSiblingPeriodsResult {
  const { frequency, frequencyCycleStart, assignedMonth, reviewYear } = input;

  const terminalMonth = getActiveMonthForCycle(
    frequency ?? null,
    assignedMonth,
    reviewYear,
    frequencyCycleStart ?? null,
  );

  const scope = buildCycleScopeLabel(
    frequency ?? null,
    assignedMonth,
    reviewYear,
    frequencyCycleStart ?? null,
  );

  const isMultiMonth =
    !!frequency && MULTI_MONTH_FREQUENCIES.includes(frequency) && scope.isMultiMonth;

  const terminal: SiblingPeriod = {
    period: terminalMonth,
    year: scope.anchorYear,
  };

  if (!isMultiMonth) {
    return {
      isMultiMonth: false,
      terminal,
      siblings: [],
      allForwardMonths: [terminal],
    };
  }

  // Walk cycleMonths in calendar order. For wrapping cycles (e.g. Nov,Dec,Jan)
  // the array is already in chronological cycle order from buildCycleScopeLabel.
  // Determine year for each month: months before the wrap point belong to
  // reviewYear, months after the wrap point belong to reviewYear+1.
  const cycleMonths = scope.cycleMonths;
  const assignedNum = getMonthNumber(assignedMonth);

  // Detect wrap: a non-contiguous numeric range indicates a year wrap.
  const nums = cycleMonths.map(getMonthNumber);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const wraps = max - min + 1 !== cycleMonths.length;

  // Build per-month {period, year, ordinal} records. Ordinal is the position
  // along the chronological cycle starting from the cycle's first month.
  const records: Array<SiblingPeriod & { ordinal: number; monthNum: number; year: number }> = [];

  if (!wraps) {
    // Simple case: all months belong to reviewYear.
    cycleMonths.forEach((m, idx) => {
      records.push({
        period: m,
        year: reviewYear,
        ordinal: idx,
        monthNum: getMonthNumber(m),
      });
    });
  } else {
    // Wrapping case: months >= some pivot are in reviewYear, months < pivot
    // are in reviewYear+1. Find the pivot by locating the first descent in
    // the numeric sequence (cycleMonths is in chronological cycle order, so
    // monthNums increase, then drop to a lower number when wrapping).
    let pivot = -1;
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] < nums[i - 1]) {
        pivot = i;
        break;
      }
    }
    if (pivot === -1) pivot = nums.length;
    cycleMonths.forEach((m, idx) => {
      const yr = idx < pivot ? reviewYear : reviewYear + 1;
      records.push({
        period: m,
        year: yr,
        ordinal: idx,
        monthNum: getMonthNumber(m),
      });
    });
  }

  // Find ordinal of assigned month (within reviewYear segment).
  let assignedOrdinal = records.findIndex(
    (r) => r.monthNum === assignedNum && r.year === reviewYear,
  );
  if (assignedOrdinal === -1) {
    // assigned month isn't in the cycle (shouldn't happen) — treat as start.
    assignedOrdinal = 0;
  }

  // Forward months = ordinal >= assignedOrdinal.
  const forward = records.filter((r) => r.ordinal >= assignedOrdinal);

  // Terminal is the last (highest ordinal) month in the cycle.
  const terminalRecord = records[records.length - 1];
  const resolvedTerminal: SiblingPeriod = {
    period: terminalRecord.period,
    year: terminalRecord.year,
  };

  // Siblings = forward months minus terminal.
  const siblings: SiblingPeriod[] = forward
    .filter((r) => !(r.period === resolvedTerminal.period && r.year === resolvedTerminal.year))
    .map((r) => ({ period: r.period, year: r.year }));

  return {
    isMultiMonth: true,
    terminal: resolvedTerminal,
    siblings,
    allForwardMonths: forward.map((r) => ({ period: r.period, year: r.year })),
  };
}

/** Stable string key for a (period, year) pair — handy for filtering. */
export function periodKey(p: SiblingPeriod): string {
  return `${p.period}|${p.year}`;
}

/**
 * Given a KPI's (frequency, reviewPeriod, reviewYear), return the explicit
 * list of (period, year) tuples that belong to the SAME multi-month cycle as
 * the source — including the source itself. For non-multi-month frequencies
 * (Daily/Weekly/Monthly) returns just the source tuple.
 *
 * Correctly handles year-wrapping cycles (e.g. Quarterly Nov-2026 →
 * [Nov-2026, Dec-2026, Jan-2027]).
 *
 * Use this to bound multi-month cascade operations (status step-back sibling
 * reversion, evidence propagation, etc.) so they never leak across cycle
 * boundaries inside the same fiscal year.
 */
export function getCycleMembers(input: {
  frequency: string | null | undefined;
  reviewPeriod: string;
  reviewYear: number;
  frequencyCycleStart?: string | null;
}): SiblingPeriod[] {
  const { frequency, reviewPeriod, reviewYear, frequencyCycleStart } = input;

  const scope = buildCycleScopeLabel(
    frequency ?? null,
    reviewPeriod,
    reviewYear,
    frequencyCycleStart ?? null,
  );

  if (!scope.isMultiMonth) {
    return [{ period: reviewPeriod, year: reviewYear }];
  }

  const cycleMonths = scope.cycleMonths;
  const nums = cycleMonths.map(getMonthNumber);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const wraps = max - min + 1 !== cycleMonths.length;

  let pivot = cycleMonths.length;
  if (wraps) {
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] < nums[i - 1]) {
        pivot = i;
        break;
      }
    }
  }

  // buildCycleScopeLabel returns anchorYear = year of the terminal (last) month.
  // For non-wrap cycles, every month lives in anchorYear.
  // For wrap cycles, early months (idx<pivot) live in anchorYear-1 and late
  // months (idx>=pivot) live in anchorYear.
  const earlyYear = wraps ? scope.anchorYear - 1 : scope.anchorYear;
  return cycleMonths.map((period, idx) => ({
    period,
    year: wraps && idx >= pivot ? scope.anchorYear : earlyYear,
  }));
}

// Re-export MONTHS for convenience in tests.
export { MONTHS };