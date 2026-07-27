/**
 * ADR-174 / POLICY §AR-KRA-RATING-VISIBILITY.
 *
 * Pure builder that explains how an annual-review score was reached: one row
 * per scoring parameter (criterion or system slot) with achieved value, the
 * maximum it could reach, its weight and its contribution to the /100 total.
 *
 * Used by the employee "How your score was calculated" card and by the
 * Annual Review Report's "Score Parameters" export sheet, so both surfaces
 * always agree.
 */

import type { AnnualReviewTemplate } from '@/types/annualReview';
import { isKraBasedTemplate } from '@/lib/annualReview/kraDerivedRating';

export type ScoreParameterKind = 'criterion' | 'system';

export interface ScoreParameterRow {
  id: string;
  name: string;
  kind: ScoreParameterKind;
  /** 'carry_kra' | 'safety' | ... for system slots; undefined for criteria. */
  source?: string;
  /** Rating 0..5 for criteria; resolved points for system slots. */
  achieved: number | null;
  /** 5 for criteria; the slot weight for system slots. */
  outOf: number;
  /** Template weight (criteria) or slot weight (system). */
  weight: number;
  /** Points contributed to the /100 total. */
  contribution: number | null;
}

export interface ScoreParameterBreakdown {
  rows: ScoreParameterRow[];
  criteriaActual: number;
  criteriaMax: number;
  systemActual: number;
  systemMax: number;
  totalActual: number;
  totalMax: number;
  /** 'With KRA' | 'Without KRA' | 'Blended' — mirrors the report column. */
  scoringMode: ScoringMode;
}

export type ScoringMode = 'With KRA' | 'Without KRA' | 'Blended';

/**
 * Report/UI label for how a rating was derived.
 * - "With KRA": the whole score comes from carry_kra system slot(s).
 * - "Blended": carry_kra slot(s) plus scored criteria.
 * - "Without KRA": no carry_kra slot at all.
 */
export function resolveScoringMode(
  template: Pick<AnnualReviewTemplate, 'sections'> | null | undefined,
): ScoringMode {
  if (!isKraBasedTemplate(template)) return 'Without KRA';
  const criteriaWeight = (template?.sections?.criteria ?? [])
    .reduce((a, c) => a + (Number(c.weight) || 0), 0);
  return criteriaWeight > 0 ? 'Blended' : 'With KRA';
}

/**
 * Builds the parameter-level breakdown.
 *
 * @param criteriaScores 0..5 rating per criterion id (terminal reviewer's scores).
 * @param systemScores   resolved, weight-scaled points per system slot id.
 */
export function buildScoreParameters(
  template: Pick<AnnualReviewTemplate, 'sections'> | null | undefined,
  criteriaScores: Record<string, number> | null | undefined,
  systemScores: Record<string, number> | null | undefined,
): ScoreParameterBreakdown {
  const criteria = template?.sections?.criteria ?? [];
  const slots = template?.sections?.system_scores ?? [];
  const rows: ScoreParameterRow[] = [];

  let criteriaActual = 0;
  let criteriaMax = 0;
  for (const c of criteria) {
    const weight = Number(c.weight) || 0;
    const raw = criteriaScores?.[c.id];
    const achieved = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    const contribution = achieved == null ? null : Number((achieved * weight).toFixed(4));
    criteriaMax += weight * 5;
    if (contribution != null) criteriaActual += contribution;
    rows.push({
      id: c.id, name: c.name, kind: 'criterion',
      achieved, outOf: 5, weight, contribution,
    });
  }

  let systemActual = 0;
  let systemMax = 0;
  for (const s of slots) {
    const weight = Number((s as { weight?: number }).weight) || 0;
    const raw = systemScores?.[s.id];
    const achieved = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    systemMax += weight;
    if (achieved != null) systemActual += achieved;
    rows.push({
      id: s.id,
      name: (s as { label?: string; name?: string }).label
        ?? (s as { name?: string }).name
        ?? 'System score',
      kind: 'system',
      source: (s as { source?: string }).source,
      achieved, outOf: weight, weight,
      contribution: achieved,
    });
  }

  return {
    rows,
    criteriaActual: Number(criteriaActual.toFixed(2)),
    criteriaMax: Number(criteriaMax.toFixed(2)),
    systemActual: Number(systemActual.toFixed(2)),
    systemMax: Number(systemMax.toFixed(2)),
    totalActual: Number((criteriaActual + systemActual).toFixed(2)),
    totalMax: Number((criteriaMax + systemMax).toFixed(2)),
    scoringMode: resolveScoringMode(template),
  };
}
