/**
 * ADR-130 / POLICY §AR-KRA-GRID-DISPLAY.
 *
 * Presentation helpers for the Annual Review admin grid when an employee is
 * mapped to a "KRA-based" template — one whose entire criteria pool has been
 * replaced by a `carry_kra` system slot (e.g. "Generic M / W - (With KRA)").
 *
 * On those templates reviewers never score per-criterion, so
 * `annual_review_responses.weighted_score` stays 0 and every `<Stage> /5`
 * column in the admin grid renders "—" — hiding a rating that is fully
 * determined by the employee's rolled-up KRA achievement.
 *
 * These pure helpers let the grid:
 *   • detect a KRA template;
 *   • normalise a carry_kra points value into a 0..5 rating;
 *   • project a total-score / final-rating band before HR finalizes.
 *
 * SSOT parity: rating bands match `annual_review_resolve_final_rating`
 * (Outstanding ≥85, Good ≥70, Average ≥55, else Poor).
 */

import type { AnnualReviewTemplate, TemplateSystemScore } from '@/types/annualReview';

export interface KraSlotInfo {
  slot: TemplateSystemScore;
  /** Sum of KRA-slot weights (the "KRA pool" in template points). */
  kraMaxPoints: number;
}

/** True when at least one system_scores slot has `source === 'carry_kra'`. */
export function isKraBasedTemplate(
  template: Pick<AnnualReviewTemplate, 'sections'> | null | undefined,
): boolean {
  const slots = template?.sections?.system_scores ?? [];
  return slots.some((s) => s.source === 'carry_kra');
}

/** Returns the (first) carry_kra slot and the summed KRA-slot weight pool. */
export function resolveKraSlot(
  template: Pick<AnnualReviewTemplate, 'sections'> | null | undefined,
): KraSlotInfo | null {
  const slots = template?.sections?.system_scores ?? [];
  const kra = slots.filter((s) => s.source === 'carry_kra');
  if (kra.length === 0) return null;
  const kraMaxPoints = kra.reduce((a, s) => a + (Number(s.weight) || 0), 0);
  return { slot: kra[0], kraMaxPoints };
}

/**
 * Converts a KRA points value (already weight-scaled by `buildCarrySnapshot`)
 * into a 0..5 rating. Returns null when maxPoints ≤ 0 or points is nullish.
 */
export function kraPointsToRating0to5(
  points: number | null | undefined,
  maxPoints: number | null | undefined,
): number | null {
  if (points == null || !Number.isFinite(points)) return null;
  const max = Number(maxPoints) || 0;
  if (max <= 0) return null;
  const pct = Math.min(1, Math.max(0, points / max));
  return Number((pct * 5).toFixed(4));
}

export interface KraProjectedFinal {
  /** Percentage-point total (0..100) blending KRA + any other system slots. */
  total_0_100: number;
  /** Rating band mirrored from `annual_review_resolve_final_rating`. */
  rating: 'Outstanding' | 'Good' | 'Average' | 'Poor';
}

/**
 * Client-side mirror of the DB rating band table
 * (annual_review_settings.auto_final_rating_thresholds default).
 * Kept in sync with the seed in POLICY §AR-FINAL-RATING-BANDS.
 */
export function resolveKraRatingBand(total_0_100: number): KraProjectedFinal['rating'] {
  const t = Number(total_0_100);
  if (t >= 85) return 'Outstanding';
  if (t >= 70) return 'Good';
  if (t >= 55) return 'Average';
  return 'Poor';
}

/**
 * Projects the final /100 score for a KRA-based instance from the currently
 * resolved system_score map. The map's values are already weight-scaled
 * percentage points (see `useResolvedSystemScores`), so the projection is
 * simply the clamped sum. Returns null when no KRA slot is populated yet.
 */
export function projectKraFinalFromSystemScores(
  template: Pick<AnnualReviewTemplate, 'sections'> | null | undefined,
  systemScoresValues: Record<string, number> | null | undefined,
): KraProjectedFinal | null {
  if (!isKraBasedTemplate(template)) return null;
  const slots = template?.sections?.system_scores ?? [];
  const kraSlotIds = new Set(slots.filter((s) => s.source === 'carry_kra').map((s) => s.id));
  let kraSum = 0;
  let kraPresent = false;
  for (const id of kraSlotIds) {
    const v = systemScoresValues?.[id];
    if (typeof v === 'number' && Number.isFinite(v)) { kraSum += v; kraPresent = true; }
  }
  if (!kraPresent) return null;
  let systemSum = kraSum;
  for (const s of slots) {
    if (kraSlotIds.has(s.id)) continue;
    const v = systemScoresValues?.[s.id];
    if (typeof v === 'number' && Number.isFinite(v)) systemSum += v;
  }
  const clamped = Math.min(100, Math.max(0, systemSum));
  const total = Number(clamped.toFixed(2));
  return { total_0_100: total, rating: resolveKraRatingBand(total) };
}