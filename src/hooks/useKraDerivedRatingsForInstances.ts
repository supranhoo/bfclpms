/**
 * ADR-130 / POLICY §AR-KRA-GRID-DISPLAY.
 *
 * Batch counterpart of `useResolvedSystemScores` for the Annual Review admin
 * grid. Given a page of instances + a template lookup, this hook returns a
 * per-instance projected `{ rating_0_5, total_0_100, rating }` for every KRA-
 * based instance so the grid can render a meaningful "Final" / "Rating" for
 * locked stages that would otherwise show "—".
 *
 * Query keys mirror `useResolvedSystemScores` so the TanStack cache dedupes
 * with the employee page whenever a user drills into a single review.
 */

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type {
  AnnualReviewInstance,
  AnnualReviewTemplate,
  CarryKraConfig,
} from '@/types/annualReview';
import { buildCarrySnapshot } from '@/services/annualReview/carryKraScore';
import { normaliseSystemScoreValue } from '@/lib/annualReview/systemScoreNormalise';
import {
  isKraBasedTemplate,
  kraPointsToRating0to5,
  projectKraFinalFromSystemScores,
  resolveKraSlot,
  type KraProjectedFinal,
} from '@/lib/annualReview/kraDerivedRating';

export interface KraDerivedRating {
  /** 0..5 KRA rating that reviewers effectively agreed with. */
  rating_0_5: number | null;
  /** Same shape as ADR-124 total_score / final_rating (projection when not finalized). */
  projected: KraProjectedFinal | null;
}

type MinimalInstance = Pick<
  AnnualReviewInstance,
  'id' | 'employee_id' | 'system_scores' | 'system_scores_raw'
>;

export function useKraDerivedRatingsForInstances(
  instances: MinimalInstance[],
  templateForInstance: (i: MinimalInstance) => AnnualReviewTemplate | null | undefined,
  fiscalYear: number | null | undefined,
): Record<string, KraDerivedRating> {
  // Flatten every carry_kra slot × instance into one query list so react-query
  // can dedupe with the single-review page cache.
  const jobs = useMemo(() => {
    if (typeof fiscalYear !== 'number') return [] as Array<{
      instanceId: string;
      slotId: string;
      weight: number;
      cfg: CarryKraConfig;
      employeeId: string;
    }>;
    const list: Array<{
      instanceId: string;
      slotId: string;
      weight: number;
      cfg: CarryKraConfig;
      employeeId: string;
    }> = [];
    for (const inst of instances) {
      const tpl = templateForInstance(inst);
      if (!tpl || !isKraBasedTemplate(tpl)) continue;
      const eid = inst.employee_id;
      if (!eid) continue;
      const slots = tpl.sections?.system_scores ?? [];
      for (const s of slots) {
        if (s.source !== 'carry_kra') continue;
        list.push({
          instanceId: inst.id,
          slotId: s.id,
          weight: Number(s.weight) || 0,
          cfg: s.carry_config ?? { aggregation: 'overall_avg', excludeNa: true },
          employeeId: eid,
        });
      }
    }
    return list;
  }, [instances, templateForInstance, fiscalYear]);

  const queries = useQueries({
    queries: jobs.map((j) => ({
      queryKey: ['carryKraScore', j.employeeId, fiscalYear, j.cfg, j.weight] as const,
      queryFn: () => buildCarrySnapshot(j.employeeId, fiscalYear as number, j.cfg, j.weight),
      enabled: typeof fiscalYear === 'number',
      staleTime: 60_000,
    })),
  });

  return useMemo(() => {
    const out: Record<string, KraDerivedRating> = {};
    // Per-instance overlay so we can call project* with the live values.
    const overlayByInstance = new Map<string, Record<string, number>>();
    jobs.forEach((j, idx) => {
      const snap = queries[idx]?.data;
      if (!snap || typeof snap.value !== 'number') return;
      const map = overlayByInstance.get(j.instanceId) ?? {};
      map[j.slotId] = snap.value;
      overlayByInstance.set(j.instanceId, map);
    });

    for (const inst of instances) {
      const tpl = templateForInstance(inst);
      if (!tpl || !isKraBasedTemplate(tpl)) continue;
      const kraInfo = resolveKraSlot(tpl);
      if (!kraInfo) continue;

      // Merge persisted (weight-scaled points) with live carry snapshot,
      // normalising every non-KRA slot the same way the employee page does.
      const persisted = inst.system_scores ?? {};
      const rawMap = inst.system_scores_raw ?? {};
      const merged: Record<string, number> = {};
      for (const s of tpl.sections?.system_scores ?? []) {
        if (s.source === 'carry_kra') {
          const live = overlayByInstance.get(inst.id)?.[s.id];
          if (typeof live === 'number') merged[s.id] = live;
          else if (typeof persisted[s.id] === 'number') merged[s.id] = persisted[s.id];
        } else {
          merged[s.id] = normaliseSystemScoreValue(s, persisted[s.id], rawMap[s.id]);
        }
      }

      // KRA rating: sum resolved KRA-slot points / kraMaxPoints * 5.
      let kraPoints = 0;
      let anyKra = false;
      for (const s of tpl.sections?.system_scores ?? []) {
        if (s.source !== 'carry_kra') continue;
        const v = merged[s.id];
        if (typeof v === 'number' && Number.isFinite(v)) { kraPoints += v; anyKra = true; }
      }
      const rating_0_5 = anyKra
        ? kraPointsToRating0to5(kraPoints, kraInfo.kraMaxPoints)
        : null;

      const projected = projectKraFinalFromSystemScores(tpl, merged);
      out[inst.id] = { rating_0_5, projected };
    }
    return out;
  }, [instances, templateForInstance, jobs, queries]);
}