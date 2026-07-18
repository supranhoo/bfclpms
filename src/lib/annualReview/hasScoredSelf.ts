/**
 * ADR-115: canonical "self form has content" check for the Assisted
 * Submission dialog and its regression tests. Mirrors the server-side gate
 * in `submit_annual_review_self_as_proxy`: at least one numeric criterion
 * score is required. `0` counts as scored (safety-binary KPIs use 0).
 *
 * Do NOT use `weighted_score` as the signal — draft auto-save never
 * populates it; that only happens inside `advance_annual_review_status`
 * (or the proxy RPC at submit time).
 */
export function hasAnyNumericCriterion(
  criteriaScores: unknown,
): boolean {
  if (!criteriaScores || typeof criteriaScores !== 'object' || Array.isArray(criteriaScores)) {
    return false;
  }
  for (const v of Object.values(criteriaScores as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) return true;
  }
  return false;
}