/**
 * ADR-220 / POLICY §AR-FINAL-RATING-CALIBRATION
 *
 * Single source of truth for the *effective* Annual Review Final Rating (/5).
 *
 * The computed rating (`total_score / 20`, ADR-212) is never overwritten. When
 * an admin records a calibration, the calibrated rating takes precedence for
 * every consumer — bands, slabs, reports and exports — while the computed value
 * stays available for audit and display.
 */
import {
  DEFAULT_RATING_SLABS,
  resolveSlabPercent,
  toRatingOutOf5,
  type RatingSlab,
} from './ratingSlab';

/** Minimal row shape needed to resolve an effective rating. */
export interface CalibratableRow {
  total_score: number | null;
  calibrated_rating?: number | null;
  calibration_reason?: string | null;
  calibrated_by_name?: string | null;
  calibrated_at?: string | null;
}

/** Rating derived from the computed final score. Null-safe. */
export function computedRating(row: CalibratableRow): number | null {
  return toRatingOutOf5(row.total_score);
}

/** True when an admin calibration is in force for this row. */
export function isCalibrated(row: CalibratableRow): boolean {
  const v = row.calibrated_rating;
  return v !== null && v !== undefined && Number.isFinite(Number(v));
}

/** Calibrated rating when present, otherwise the computed one. */
export function effectiveRating(row: CalibratableRow): number | null {
  if (isCalibrated(row)) return Math.round(Number(row.calibrated_rating) * 100) / 100;
  return computedRating(row);
}

/** Increment slab % resolved from the effective rating. */
export function effectiveSlabPercent(
  row: CalibratableRow,
  slabs: ReadonlyArray<RatingSlab> = DEFAULT_RATING_SLABS,
): number | null {
  return resolveSlabPercent(effectiveRating(row), slabs);
}
