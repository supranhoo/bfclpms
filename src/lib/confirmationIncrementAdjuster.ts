/**
 * Phase: Trainee Confirmation Increment Adjustment Engine
 *
 * Pure, configuration-driven function. Given an employee's confirmation
 * details, the current assessment cycle, and the resolved rule, it returns
 * the months that should actually be passed downstream to the slab/method
 * calculator. No business value is hardcoded — admins choose the treatment
 * per (assessment year, company, category, level).
 */

export type ConfirmationTreatment =
  | 'ignore'
  | 'adjust_covered_period'
  | 'shift_next_cycle'
  | 'carry_forward_uncovered';

export interface ConfirmationRule {
  treatment: ConfirmationTreatment;
}

export interface AdjusterInput {
  doj: string | null;                                   // ISO yyyy-mm-dd
  confirmationDate: string | null;
  confirmationIncrementGranted: boolean;
  confirmationIncrementEffectiveDate: string | null;
  assessmentCycleStart: string;                          // ISO yyyy-mm-dd
  assessmentCycleEnd: string;                            // inclusive last day
  /** Months not covered by the previous cycle (for carry-forward). */
  previousCycleUncoveredMonths?: number;
  /** Naive months the slab engine would have used had there been no rule. */
  naiveEligibleMonths: number;
  rule: ConfirmationRule;
}

export interface AdjusterResult {
  treatmentApplied: ConfirmationTreatment;
  periodCoveredMonths: number;
  balanceEligibleMonths: number;
  carryForwardMonths: number;
  finalEligibleMonths: number;
  adjustmentReason: string;
}

/** Whole-month diff between two ISO dates (start inclusive, end exclusive). */
function monthsBetween(fromISO: string, toISO: string): number {
  if (!fromISO || !toISO) return 0;
  const from = new Date(fromISO + 'T00:00:00Z');
  const to = new Date(toISO + 'T00:00:00Z');
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  if (to <= from) return 0;
  const years = to.getUTCFullYear() - from.getUTCFullYear();
  const months = to.getUTCMonth() - from.getUTCMonth();
  const dayAdj = to.getUTCDate() >= from.getUTCDate() ? 0 : -1;
  return Math.max(0, years * 12 + months + dayAdj);
}

/** Months of the confirmation-increment window that fall INSIDE the cycle. */
function coveredMonthsInCycle(
  confirmationEffective: string,
  cycleEnd: string,
): number {
  // Confirmation increment covers from its effective date forward.
  // Within the current cycle, the "covered" portion is effective → cycleEnd.
  if (confirmationEffective >= cycleEnd) return 0;
  return monthsBetween(confirmationEffective, cycleEnd);
}

export function adjustConfirmationIncrement(input: AdjusterInput): AdjusterResult {
  const {
    confirmationIncrementGranted,
    confirmationIncrementEffectiveDate,
    assessmentCycleStart,
    assessmentCycleEnd,
    previousCycleUncoveredMonths = 0,
    naiveEligibleMonths,
    rule,
  } = input;

  // Short-circuit: no confirmation increment OR treatment = ignore → naive.
  if (
    rule.treatment === 'ignore' ||
    !confirmationIncrementGranted ||
    !confirmationIncrementEffectiveDate
  ) {
    return {
      treatmentApplied: rule.treatment,
      periodCoveredMonths: 0,
      balanceEligibleMonths: naiveEligibleMonths,
      carryForwardMonths: 0,
      finalEligibleMonths: naiveEligibleMonths,
      adjustmentReason:
        rule.treatment === 'ignore'
          ? 'Policy: ignore confirmation increment'
          : 'No confirmation increment recorded',
    };
  }

  // Confirmation increment effective date BEFORE the cycle → entire cycle is
  // "new" service, nothing to subtract.
  const effective = confirmationIncrementEffectiveDate;
  const covered =
    effective <= assessmentCycleStart
      ? 0
      : Math.min(
          coveredMonthsInCycle(effective, assessmentCycleEnd),
          naiveEligibleMonths,
        );
  const balance = Math.max(0, naiveEligibleMonths - covered);

  switch (rule.treatment) {
    case 'adjust_covered_period': {
      return {
        treatmentApplied: 'adjust_covered_period',
        periodCoveredMonths: covered,
        balanceEligibleMonths: balance,
        carryForwardMonths: 0,
        finalEligibleMonths: balance,
        adjustmentReason: `Subtracted ${covered} month(s) already covered by confirmation increment effective ${effective}`,
      };
    }
    case 'shift_next_cycle': {
      return {
        treatmentApplied: 'shift_next_cycle',
        periodCoveredMonths: covered,
        balanceEligibleMonths: 0,
        carryForwardMonths: 0,
        finalEligibleMonths: 0,
        adjustmentReason:
          'Employee shifted to next normal cycle — no increment in this AY',
      };
    }
    case 'carry_forward_uncovered': {
      const final = balance + previousCycleUncoveredMonths;
      return {
        treatmentApplied: 'carry_forward_uncovered',
        periodCoveredMonths: covered,
        balanceEligibleMonths: balance,
        carryForwardMonths: previousCycleUncoveredMonths,
        finalEligibleMonths: final,
        adjustmentReason: `Balance ${balance}m + carry-forward ${previousCycleUncoveredMonths}m from prior cycle`,
      };
    }
    default:
      // Exhaustive guard — should be unreachable.
      return {
        treatmentApplied: rule.treatment,
        periodCoveredMonths: covered,
        balanceEligibleMonths: balance,
        carryForwardMonths: 0,
        finalEligibleMonths: balance,
        adjustmentReason: 'Unknown treatment — defaulted to balance',
      };
  }
}

export const __test__ = { monthsBetween, coveredMonthsInCycle };