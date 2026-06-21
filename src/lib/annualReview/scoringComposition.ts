import type { AnnualReviewTemplate, TemplateCriterion, TemplateSystemScore } from '@/types/annualReview';
import { computeCriteriaScore } from './scoring';

/**
 * Display-oriented breakdown of an appraisal score into its two contributors:
 *   Overall = clamp( SystemScore + CriteriaContribution , 0..100 )
 *
 * `system_scores[id]` values are persisted already-in-percentage-points (their
 * sum is the System contribution). Criteria values are stored as raw 0..5 scores
 * weighted by `criterion.weight`; we surface both the raw weighted total
 * (`criteriaRaw / criteriaRawMax`) and a normalised "/100"-style contribution
 * (`criteriaActual / criteriaMax`) so the UI math is consistent with the
 * persisted Overall.
 *
 * Pure function — covered by `scoringComposition.test.ts`.
 */
export interface ScoreComposition {
  systemActual: number;
  systemMax: number;
  criteriaActual: number;
  criteriaMax: number;
  criteriaRaw: number;
  criteriaRawMax: number;
  overallActual: number;
  overallMax: 100;
  hasSystem: boolean;
  hasCriteria: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function computeScoreComposition(
  template: AnnualReviewTemplate | null | undefined,
  systemScoresValues: Record<string, number> | null | undefined,
  criteriaScores: Record<string, number | undefined> | null | undefined,
): ScoreComposition {
  const sysConfig: TemplateSystemScore[] = template?.sections.system_scores ?? [];
  const criteria: TemplateCriterion[] = template?.sections.criteria ?? [];

  const systemMax = sysConfig.reduce(
    (acc, s) => acc + (Number.isFinite(s.weight) ? Number(s.weight) : 0),
    0,
  );
  let systemActual = 0;
  for (const s of sysConfig) {
    const v = (systemScoresValues ?? {})[s.id];
    if (typeof v === 'number' && Number.isFinite(v)) systemActual += v;
  }

  const raw = computeCriteriaScore(criteria, criteriaScores ?? {});
  const criteriaMax = clamp(100 - systemMax, 0, 100);

  // Scale the raw weighted criteria total into percentage points so the user
  // sees consistent /100 math. When the raw max is 0 we contribute 0.
  const criteriaActual = raw.maxCriteriaScore > 0
    ? (raw.totalCriteriaScore / raw.maxCriteriaScore) * criteriaMax
    : 0;

  const overallActual = clamp(systemActual + criteriaActual, 0, 100);

  return {
    systemActual,
    systemMax,
    criteriaActual,
    criteriaMax,
    criteriaRaw: raw.totalCriteriaScore,
    criteriaRawMax: raw.maxCriteriaScore,
    overallActual,
    overallMax: 100,
    hasSystem: sysConfig.length > 0,
    hasCriteria: criteria.length > 0,
  };
}