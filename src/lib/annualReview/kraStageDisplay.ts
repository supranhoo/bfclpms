/**
 * ADR-179 / POLICY §AR-KRA-GRID-DISPLAY.
 *
 * SSOT for "what /5 value does a stage column show?".
 *
 * Two earlier decisions collided:
 *   • ADR-130 — on KRA-weighted templates reviewers never score criteria, so
 *     the stage columns must fall back to the KRA-derived rating.
 *   • ADR-172 — a locked response with an empty `criteria_scores` map must
 *     render "—", never 0.0.
 *
 * ADR-172 collapsed both cases to `null`, which silently disabled ADR-130 for
 * every KRA employee (blank Self/Manager/.../HR columns despite a real Final).
 * The distinction is: an EMPTY stage on a template that HAS criteria is
 * genuinely unscored; an empty stage on a template with NO criteria (all
 * weight in a `carry_kra` slot) is scored by KRA achievement.
 */

import type { AnnualReviewerRole, TemplateCriterion } from '@/types/annualReview';
import { computeCriteriaRatingOutOf5 } from '@/lib/annualReview/scoring';

/**
 * One reviewer stage of one instance, as returned by `fetchInstanceStageCells`.
 * `submitted` is always true (unsubmitted stages are absent from the map);
 * `scored` means the reviewer actually recorded per-criterion scores.
 */
export interface StageScoreCell {
  weighted_score: number | null;
  scored: boolean;
  submitted: boolean;
}

export type StageRatingSource = 'criteria' | 'kra' | 'narrative';

export interface StageDisplayRating {
  /** 0..5 value to render, or null when the column must show "—". */
  value: number | null;
  /** Where the number came from — drives the cell tooltip. */
  source: StageRatingSource | null;
}

const NONE: StageDisplayRating = { value: null, source: null };

/**
 * ADR-197 — number of criteria the given stage is expected to score on this
 * template. Zero means the stage is narrative-only and a blank score column is
 * correct, not a data defect. Mirrors the PL/pgSQL
 * `public.annual_review_stage_scoreable_criteria_count`.
 */
export function stageScoreableCriteriaCount(
  criteria: TemplateCriterion[] | null | undefined,
  role: AnnualReviewerRole,
): number {
  let n = 0;
  for (const c of criteria ?? []) {
    if (!(c.reviewer_stages ?? []).includes(role)) continue;
    if ((Number(c.weight) || 0) > 0) n += 1;
  }
  return n;
}

export function resolveStageDisplayRating(args: {
  cell: StageScoreCell | null | undefined;
  criteria: TemplateCriterion[] | null | undefined;
  role: AnnualReviewerRole;
  isKraTemplate: boolean;
  /** 0..5 KRA-derived rating for the instance (null when unresolved). */
  kraRating: number | null | undefined;
}): StageDisplayRating {
  const { cell, criteria, role, isKraTemplate, kraRating } = args;
  // Stage never responded → nothing to show, on any template.
  if (!cell || !cell.submitted) return NONE;

  // Criteria templates: only a genuinely scored stage yields a rating.
  if (cell.scored) {
    const r = computeCriteriaRatingOutOf5(criteria, cell.weighted_score, role);
    if (r != null) return { value: r, source: 'criteria' };
  }

  // KRA templates: the stage carries the employee's KRA achievement.
  if (isKraTemplate && typeof kraRating === 'number' && Number.isFinite(kraRating)) {
    return { value: kraRating, source: 'kra' };
  }

  // ADR-197: the template asks this stage for no scores at all — the reviewer
  // genuinely completed a narrative-only stage. Distinguish it from a defect.
  if (stageScoreableCriteriaCount(criteria, role) === 0) {
    return { value: null, source: 'narrative' };
  }

  // ADR-172: unscored stage on a criteria template stays blank.
  return NONE;
}

/** Projects the rich cell map back to the legacy numeric map (ADR-172 shape). */
export function toStageNumberMap<R extends string>(
  cells: Partial<Record<R, StageScoreCell>> | null | undefined,
): Partial<Record<R, number | null>> {
  const out: Partial<Record<R, number | null>> = {};
  for (const [role, cell] of Object.entries(cells ?? {}) as Array<[R, StageScoreCell]>) {
    out[role] = cell.scored ? cell.weighted_score : null;
  }
  return out;
}
