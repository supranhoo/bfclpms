/**
 * Post-Cutoff Carry-Forward evaluator.
 *
 * Decides whether an employee joined the joining-AY AFTER the configured
 * Increment Eligibility Cutoff Date (e.g. 31 Dec). If yes, the joining-AY
 * increment is skipped, and (when carry-forward is enabled) the unused
 * balance months from GDOJ → AY end are returned so the engine can add
 * them to the NEXT AY's eligible-month count.
 *
 * Pure function — no DB, no globals. Mirrored verbatim inside the
 * compute-increment edge function (Deno) and tested independently.
 */

export interface PostCutoffInput {
  /** Group date-of-joining (`profiles.group_doj`). Null when missing. */
  gdoj: Date | null;
  /** AY start (typically Jul 1 of starting year, UTC). */
  ayStart: Date;
  /** AY end (typically Jun 30 of ending year, UTC). */
  ayEnd: Date;
  /** Cutoff month 1-12 (December = 12). Null = feature disabled. */
  cutoffMonth: number | null;
  /** Cutoff day-of-month 1-31. Null = feature disabled. */
  cutoffDay: number | null;
  /** Admin toggle — when false, balance months are NOT carried forward. */
  carryForwardEnabled: boolean;
}

export interface PostCutoffResult {
  /** True only when GDOJ falls strictly AFTER the cutoff date AND inside the joining AY. */
  isPostCutoffJoiner: boolean;
  /**
   * Whole months from the start of the month AFTER GDOJ through AY end.
   * Always 0 when `carryForwardEnabled` is false or the employee is not a
   * post-cutoff joiner. Capped at 12.
   */
  carryForwardMonths: number;
  /** ISO date (yyyy-mm-dd) of the resolved cutoff within the AY, or null when disabled. */
  cutoffDateISO: string | null;
  /** Human-readable trace used in run details / reasons. */
  reason: string;
}

function clampDay(year: number, monthIdx0: number, day: number): Date {
  // monthIdx0 = 0-based month. Clamp the day to the last valid day of that month
  // (e.g. cutoff "31 Feb" → 28 or 29) so admin inputs like 31 never overflow.
  const lastDay = new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIdx0, Math.min(day, lastDay)));
}

function resolveCutoffInsideAY(
  cutoffMonth: number,
  cutoffDay: number,
  ayStart: Date,
  ayEnd: Date,
): Date {
  // Try cutoff anchored to the AY-start calendar year; if that lands before
  // AY start, roll to the next year so it stays inside the AY window.
  const startYear = ayStart.getUTCFullYear();
  let candidate = clampDay(startYear, cutoffMonth - 1, cutoffDay);
  if (candidate.getTime() < ayStart.getTime()) {
    candidate = clampDay(startYear + 1, cutoffMonth - 1, cutoffDay);
  }
  // Defensive: if the cutoff somehow exceeds AY end (mis-configured),
  // clamp to AY end so the post-cutoff branch can never fire.
  if (candidate.getTime() > ayEnd.getTime()) return ayEnd;
  return candidate;
}

function wholeMonthsFromNextMonth(gdoj: Date, ayEnd: Date): number {
  // Months from the first day of (GDOJ.month + 1) through ayEnd, inclusive.
  const startOfNext = new Date(Date.UTC(gdoj.getUTCFullYear(), gdoj.getUTCMonth() + 1, 1));
  if (startOfNext.getTime() > ayEnd.getTime()) return 0;
  const years = ayEnd.getUTCFullYear() - startOfNext.getUTCFullYear();
  const months = ayEnd.getUTCMonth() - startOfNext.getUTCMonth();
  // ayEnd is the last day of its month, so the partial month at the tail
  // counts as 1 full month.
  return Math.max(0, Math.min(12, years * 12 + months + 1));
}

export function evaluatePostCutoff(input: PostCutoffInput): PostCutoffResult {
  const { gdoj, ayStart, ayEnd, cutoffMonth, cutoffDay, carryForwardEnabled } = input;

  if (
    !gdoj ||
    cutoffMonth == null ||
    cutoffDay == null ||
    !Number.isFinite(cutoffMonth) ||
    !Number.isFinite(cutoffDay) ||
    cutoffMonth < 1 || cutoffMonth > 12 ||
    cutoffDay < 1 || cutoffDay > 31
  ) {
    return {
      isPostCutoffJoiner: false,
      carryForwardMonths: 0,
      cutoffDateISO: null,
      reason: 'Cutoff not configured or GDOJ missing — feature inactive',
    };
  }

  // GDOJ must lie inside the joining AY for the post-cutoff rule to fire.
  if (gdoj.getTime() < ayStart.getTime() || gdoj.getTime() > ayEnd.getTime()) {
    const cutoffDate = resolveCutoffInsideAY(cutoffMonth, cutoffDay, ayStart, ayEnd);
    return {
      isPostCutoffJoiner: false,
      carryForwardMonths: 0,
      cutoffDateISO: cutoffDate.toISOString().slice(0, 10),
      reason: 'GDOJ outside joining AY — post-cutoff rule does not apply',
    };
  }

  const cutoffDate = resolveCutoffInsideAY(cutoffMonth, cutoffDay, ayStart, ayEnd);
  const cutoffISO = cutoffDate.toISOString().slice(0, 10);

  if (gdoj.getTime() <= cutoffDate.getTime()) {
    return {
      isPostCutoffJoiner: false,
      carryForwardMonths: 0,
      cutoffDateISO: cutoffISO,
      reason: `GDOJ ${gdoj.toISOString().slice(0, 10)} on/before cutoff ${cutoffISO} — normal calculation applies`,
    };
  }

  const balance = wholeMonthsFromNextMonth(gdoj, ayEnd);
  const carry = carryForwardEnabled ? balance : 0;

  return {
    isPostCutoffJoiner: true,
    carryForwardMonths: carry,
    cutoffDateISO: cutoffISO,
    reason: carryForwardEnabled
      ? `Post-cutoff joiner (GDOJ ${gdoj.toISOString().slice(0, 10)} > cutoff ${cutoffISO}). ${balance} month(s) carried forward to next AY.`
      : `Post-cutoff joiner (GDOJ ${gdoj.toISOString().slice(0, 10)} > cutoff ${cutoffISO}). Carry-forward disabled — no balance months carried.`,
  };
}