import type { AnnualReviewerRole } from '@/types/annualReview';

/**
 * POLICY §AR-STAGE-LABEL-DISPLAY-SSOT (ADR-128) — presentation-only remap.
 *
 * `annual_review_responses.reviewer_role` stores the PHYSICAL stage at which
 * a reviewer acted. When Dept≡BU (or other duplicate collapses) the response
 * is persisted under the lower physical stage (`dept_head`) even though the
 * effective workflow chain collapsed that stage upward into `bu_head`
 * (see `resolveEffectiveChain`, POLICY §AR-BU-HEAD-TERMINAL / duplicate
 * seniority). The pipeline / final-score math already respects this collapse,
 * but stage chips, admin grid `/5` columns and CSV exports read the raw
 * physical stage — producing a self-contradictory UI (e.g. "Dept: 4" chip
 * while the header attributes the score to "BU Head").
 *
 * This helper is the SINGLE display-side remap. It NEVER mutates stored
 * responses; it only tells the UI which stage label a stored response should
 * appear under.
 *
 * Rules:
 *   1. `self` never remaps.
 *   2. If the response's physical stage shares its reviewer_id with a HIGHER
 *      enabled stage on the same instance AND that higher stage has NO
 *      response of its own → the response is displayed as that higher stage.
 *   3. Otherwise, keep the physical stage.
 *
 * Regression: `displayStageForResponse.test.ts`.
 */

export interface StageDisplayInstanceLike {
  employee_id: string;
  manager_id?: string | null;
  skip_id?: string | null;
  dept_head_id?: string | null;
  bu_head_id?: string | null;
  hr_id?: string | null;
  enabled_stages: AnnualReviewerRole[];
}

export interface StageDisplayResponseLike {
  reviewer_role: AnnualReviewerRole;
  reviewer_id: string | null;
}

/** Seniority order — highest tier first. `self` is intentionally excluded. */
const SENIORITY_HIGH_TO_LOW: Exclude<AnnualReviewerRole, 'self'>[] = [
  'hr',
  'bu_head',
  'dept_head',
  'skip_manager',
  'manager',
];

function reviewerIdAt(
  instance: StageDisplayInstanceLike,
  stage: AnnualReviewerRole,
): string | null {
  switch (stage) {
    case 'self':         return instance.employee_id ?? null;
    case 'manager':      return instance.manager_id ?? null;
    case 'skip_manager': return instance.skip_id ?? null;
    case 'dept_head':    return instance.dept_head_id ?? null;
    case 'bu_head':      return instance.bu_head_id ?? null;
    case 'hr':           return instance.hr_id ?? null;
  }
}

/**
 * Returns the display stage for a single stored response.
 * `allResponses` is required so we don't collapse across a stage that already
 * has its own genuine response.
 */
export function displayStageForResponse(
  response: StageDisplayResponseLike,
  instance: StageDisplayInstanceLike,
  allResponses: readonly StageDisplayResponseLike[],
): AnnualReviewerRole {
  if (response.reviewer_role === 'self') return 'self';

  const physicalIdx = SENIORITY_HIGH_TO_LOW.indexOf(
    response.reviewer_role as Exclude<AnnualReviewerRole, 'self'>,
  );
  if (physicalIdx < 0) return response.reviewer_role;

  const enabled = new Set(instance.enabled_stages);
  const physicalReviewerId = response.reviewer_id
    ?? reviewerIdAt(instance, response.reviewer_role);
  if (!physicalReviewerId) return response.reviewer_role;

  // Walk from the highest tier down to (but not including) the physical stage.
  for (let i = 0; i < physicalIdx; i++) {
    const higher = SENIORITY_HIGH_TO_LOW[i];
    if (!enabled.has(higher)) continue;
    if (reviewerIdAt(instance, higher) !== physicalReviewerId) continue;
    // Higher stage must not already own a response.
    const higherHasOwn = allResponses.some((r) => r.reviewer_role === higher);
    if (higherHasOwn) continue;
    return higher;
  }
  return response.reviewer_role;
}

/**
 * Groups a set of stored responses by their DISPLAY stage. Returns a partial
 * record so callers can distinguish "no response at this display stage" from
 * "response present". If two responses happen to display at the same stage
 * (should not occur under correct data, but defensive), the HIGHEST physical
 * stage wins so the audit-truthful row is what surfaces.
 */
export function groupResponsesByDisplayStage<
  R extends StageDisplayResponseLike,
>(
  responses: readonly R[],
  instance: StageDisplayInstanceLike,
): Partial<Record<AnnualReviewerRole, R>> {
  const out: Partial<Record<AnnualReviewerRole, R>> = {};
  for (const r of responses) {
    const stage = displayStageForResponse(r, instance, responses);
    const existing = out[stage];
    if (!existing) {
      out[stage] = r;
      continue;
    }
    // Prefer the higher physical seniority when a tie occurs.
    const rank = (role: AnnualReviewerRole) =>
      role === 'self' ? 99 : SENIORITY_HIGH_TO_LOW.indexOf(role as any);
    if (rank(r.reviewer_role) < rank(existing.reviewer_role)) out[stage] = r;
  }
  return out;
}

/**
 * Grid variant: remaps a `Partial<Record<AnnualReviewerRole, T>>` (e.g. the
 * stageScores map returned by `fetchInstanceStageScores`) by shifting a lower
 * physical stage's value up to a duplicate higher stage that has no value of
 * its own. Purely presentational.
 */
export function remapStageValueMapByDuplicates<T>(
  values: Partial<Record<AnnualReviewerRole, T>>,
  instance: StageDisplayInstanceLike,
): Partial<Record<AnnualReviewerRole, T>> {
  const present = new Set(
    (Object.keys(values) as AnnualReviewerRole[]).filter((k) => values[k] != null),
  );
  const pseudoResponses: StageDisplayResponseLike[] = Array.from(present).map(
    (role) => ({ reviewer_role: role, reviewer_id: reviewerIdAt(instance, role) }),
  );
  const out: Partial<Record<AnnualReviewerRole, T>> = {};
  for (const role of present) {
    const display = displayStageForResponse(
      { reviewer_role: role, reviewer_id: reviewerIdAt(instance, role) },
      instance,
      pseudoResponses,
    );
    if (out[display] == null) out[display] = values[role];
  }
  return out;
}