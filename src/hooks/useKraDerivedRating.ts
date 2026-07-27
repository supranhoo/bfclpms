/**
 * ADR-174 / POLICY §AR-KRA-RATING-VISIBILITY.
 *
 * Single-instance counterpart of `useKraDerivedRatingsForInstances`.
 *
 * The admin grid (ADR-130) already surfaces a KRA-derived rating for templates
 * whose criteria pool was replaced by a `carry_kra` system slot. The employee's
 * own results page did not, so a KRA-driven employee saw "—" for every stage
 * and, before HR finalizes, no rating at all.
 *
 * This hook is a thin wrapper — all maths lives in
 * `@/lib/annualReview/kraDerivedRating` (SSOT). It reuses
 * `useResolvedSystemScores` so the TanStack cache dedupes with the reviewer and
 * admin surfaces.
 */

import { useMemo } from 'react';
import type { AnnualReviewTemplate } from '@/types/annualReview';
import { useResolvedSystemScores } from '@/hooks/useResolvedSystemScores';
import {
  isKraBasedTemplate,
  kraPointsToRating0to5,
  projectKraFinalFromSystemScores,
  resolveKraSlot,
  type KraProjectedFinal,
} from '@/lib/annualReview/kraDerivedRating';

export interface SingleKraDerivedRating {
  /** True when the template's scoring is driven by a carry_kra slot. */
  isKraBased: boolean;
  /** 0..5 KRA rating, or null when no KRA points are resolved yet. */
  rating_0_5: number | null;
  /** Projected /100 total + band; null when nothing is resolvable yet. */
  projected: KraProjectedFinal | null;
  /** Resolved (weight-scaled) system-score points, keyed by slot id. */
  resolvedSystemScores: Record<string, number>;
  isLoading: boolean;
}

export function useKraDerivedRating(
  template: AnnualReviewTemplate | null | undefined,
  instance: {
    id?: string | null;
    employee_id?: string | null;
    system_scores?: Record<string, number> | null;
    system_scores_raw?: Record<string, number> | null;
  } | null | undefined,
  fiscalYear: number | undefined,
): SingleKraDerivedRating {
  const { values, isLoading } = useResolvedSystemScores(template, instance, fiscalYear);

  return useMemo(() => {
    const isKraBased = isKraBasedTemplate(template);
    if (!isKraBased) {
      return {
        isKraBased: false, rating_0_5: null, projected: null,
        resolvedSystemScores: values, isLoading,
      };
    }
    const info = resolveKraSlot(template);
    let kraPoints = 0;
    let anyKra = false;
    for (const s of template?.sections?.system_scores ?? []) {
      if (s.source !== 'carry_kra') continue;
      const v = values[s.id];
      if (typeof v === 'number' && Number.isFinite(v)) { kraPoints += v; anyKra = true; }
    }
    return {
      isKraBased: true,
      rating_0_5: anyKra ? kraPointsToRating0to5(kraPoints, info?.kraMaxPoints ?? 0) : null,
      projected: projectKraFinalFromSystemScores(template, values),
      resolvedSystemScores: values,
      isLoading,
    };
  }, [template, values, isLoading]);
}
