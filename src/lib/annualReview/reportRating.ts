/**
 * ADR-230 / POLICY §AR-RATING-SLAB + §AR-ELIGIBILITY-EXEMPTION
 *
 * Single resolver for the *effective* Annual Review outcome of one instance as
 * it must be reported anywhere in the Annual Review Report:
 *
 *   computed rating (ADR-212)
 *     -> admin calibration (ADR-220)      -> effective rating
 *     -> raw increment slab %             -> rawSlabPercent
 *     -> eligibility + exemption penalty  -> slabPercent (ADR-221/222/224)
 *
 * The Bell Curve tab and the Detail tab already applied these rules; the
 * Comprehensive tab and the main workbook did not. Both now consume this one
 * function so the surfaces cannot drift again.
 *
 * Pure presentation logic — it never mutates stored scores.
 */
import {
  DEFAULT_RATING_SLABS,
  resolveSlabPercent,
  toRatingOutOf5,
  type RatingSlab,
} from './ratingSlab';
import { effectiveRating, isCalibrated } from './effectiveRating';
import {
  ELIGIBILITY_STATUS_LABELS,
  effectiveSlabPercent,
  isSlabCapped,
  resolveEligibility,
  type EligibilityStatus,
  type ExemptionPolicyRow,
  type ExemptionRecord,
  type SlabCapOptions,
} from './effectiveEligibility';
import type { EligibilityCriterion } from '@/types/annualReview';
import type { BellCurveConfig } from './bellCurve';

/** Template id -> the eligibility questions authored on that template. */
export type TemplateCriteriaMaps = Record<string, EligibilityCriterion[]>;

/** Minimal row shape the resolver needs; satisfied by every report row type. */
export interface ReportRatingRow {
  /** Annual review instance id — the key for calibrations and exemptions. */
  instance_id: string;
  total_score: number | null;
  template_id?: string | null;
  /** ADR-117 — a per-employee override wins over the cycle template. */
  template_override_id?: string | null;
  eligibility_inputs?: Record<string, unknown> | null;
  is_excluded?: boolean | null;
}

export interface CalibrationLike {
  calibrated_rating: number;
  calibration_reason?: string | null;
}

export interface ReportRatingContext {
  slabs?: ReadonlyArray<RatingSlab>;
  capOptions?: SlabCapOptions;
  /** instance_id -> calibration record (ADR-220). */
  calibrations?: Record<string, CalibrationLike | undefined>;
  /** instance_id -> exemption records (ADR-221). */
  exemptions?: Record<string, ExemptionRecord[] | undefined>;
  policy?: ReadonlyArray<ExemptionPolicyRow>;
  /** template_id -> eligibility criteria. */
  criteriaMaps?: TemplateCriteriaMaps;
}

export interface ReportRating {
  /** total_score / 20 — never overwritten (ADR-212). */
  computedRating: number | null;
  /** Calibrated rating when an admin override exists, else the computed one. */
  effectiveRating: number | null;
  isCalibrated: boolean;
  calibratedRating: number | null;
  calibrationReason: string | null;
  eligibilityStatus: EligibilityStatus;
  /** Slab % straight from the effective rating, before any penalty. */
  rawSlabPercent: number | null;
  /** Slab % after ineligible -> 0% and the exemption penalty. */
  slabPercent: number | null;
  /** True when the exemption penalty actually reduced the percentage. */
  capApplied: boolean;
}

/** Resolve the template whose eligibility questions apply to this row. */
export function templateIdFor(row: ReportRatingRow): string | null {
  return row.template_override_id ?? row.template_id ?? null;
}

/**
 * ADR-222/224 — build the penalty options from the bell-curve config so every
 * surface (Bell Curve, Detail, Comprehensive) uses one rule.
 */
export function buildSlabCapOptions(
  config: BellCurveConfig | null | undefined,
  slabs?: ReadonlyArray<RatingSlab>,
): SlabCapOptions {
  const usable = slabs && slabs.length > 0 ? slabs : undefined;
  if (!config) return { slabs: usable };
  return {
    slabs: usable,
    capEnabled: config.exempted_slab_cap_enabled !== false,
    topTiersExcluded: config.exempted_top_tiers_excluded ?? 0,
    penalty: {
      mode: config.exempted_penalty_mode ?? 'top_tiers_excluded',
      stepDownSlabs: config.exempted_step_down_slabs ?? 1,
      topTiersExcluded: config.exempted_top_tiers_excluded ?? 0,
      scope: config.exempted_penalty_scope ?? 'all_slabs',
      topSlabs: config.exempted_penalty_top_slabs ?? 2,
      floorPercent: config.exempted_penalty_floor_percent ?? 0,
    },
  };
}

/** Effective rating + slab % for one report row. */
export function resolveReportRating(
  row: ReportRatingRow,
  ctx: ReportRatingContext = {},
): ReportRating {
  const slabs = ctx.slabs && ctx.slabs.length > 0 ? ctx.slabs : DEFAULT_RATING_SLABS;
  const calibration = ctx.calibrations?.[row.instance_id];
  const calibratedRating =
    calibration && Number.isFinite(Number(calibration.calibrated_rating))
      ? Number(calibration.calibrated_rating)
      : null;

  const calibratable = { total_score: row.total_score, calibrated_rating: calibratedRating };
  const computed = toRatingOutOf5(row.total_score);
  const rating = effectiveRating(calibratable);

  const tid = templateIdFor(row);
  const status = resolveEligibility({
    criteria: tid ? ctx.criteriaMaps?.[tid] : undefined,
    inputs: row.eligibility_inputs ?? undefined,
    exemptions: ctx.exemptions?.[row.instance_id] ?? [],
    policy: ctx.policy ?? [],
  }).status;

  const rawSlabPercent = resolveSlabPercent(rating, slabs);
  const capOptions: SlabCapOptions = { slabs, ...(ctx.capOptions ?? {}) };

  return {
    computedRating: computed,
    effectiveRating: rating,
    isCalibrated: isCalibrated(calibratable),
    calibratedRating,
    calibrationReason: calibration?.calibration_reason ?? null,
    eligibilityStatus: status,
    rawSlabPercent,
    slabPercent: effectiveSlabPercent(rawSlabPercent, status, capOptions),
    capApplied: isSlabCapped(rawSlabPercent, status, capOptions),
  };
}

/**
 * Eligibility text for the report. An administratively excluded instance is
 * reported as Excluded regardless of the criteria verdict; otherwise the
 * ADR-221 resolved status is used, and an unassessed row stays "Eligible" so
 * the column never regresses versus the legacy `is_excluded` label.
 */
export function reportEligibilityLabel(
  row: Pick<ReportRatingRow, 'is_excluded'>,
  status: EligibilityStatus,
): string {
  if (row.is_excluded) return 'Excluded';
  if (status === 'unknown') return 'Eligible';
  return ELIGIBILITY_STATUS_LABELS[status];
}
