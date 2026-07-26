/**
 * POLICY §AR-TEMPLATE-NARRATIVE-ONLY (v2.66.170)
 *
 * Some annual-review templates are narrative-only: `sections.criteria` is
 * empty and the whole score comes from `sections.system_scores` (e.g. a
 * `carry_kra` 100%-weight entry). For those templates an empty
 * `criteria_scores` object on a submitted self response is EXPECTED and is
 * NOT evidence of an incomplete or wiped self review.
 *
 * Any repair that would unlock a locked self response "so the employee can
 * rescore" MUST first check this helper. Unlocking a narrative-only
 * submission destroys a valid submission with nothing to regain.
 */
export interface TemplateSectionsLike {
  criteria?: unknown;
  system_scores?: unknown;
}

export function templateHasSelfCriteria(
  sections: TemplateSectionsLike | null | undefined,
): boolean {
  const criteria = sections?.criteria;
  return Array.isArray(criteria) && criteria.length > 0;
}

/**
 * True when an empty `criteria_scores` payload is a legitimate state for this
 * template (no criteria to score at all).
 */
export function emptyCriteriaScoresIsExpected(
  sections: TemplateSectionsLike | null | undefined,
): boolean {
  return !templateHasSelfCriteria(sections);
}