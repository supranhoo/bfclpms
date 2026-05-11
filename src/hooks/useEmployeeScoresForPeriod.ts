import { useMemo } from 'react';
import type { KPI } from '@/hooks/useKpis';

/**
 * 8-stage fallback chain: Final → Management → Auditor → HR PMS → Skip-Level → Manager → Self
 * Returns the best available score for a submission row.
 */
function getBestScore(sub: {
  final_score: number | null;
  management_score: number | null;
  auditor_score: number | null;
  hr_pms_score: number | null;
  skip_level_score: number | null;
  manager_score: number | null;
  self_score: number | null;
}): number | null {
  return sub.final_score
    ?? sub.management_score
    ?? sub.auditor_score
    ?? sub.hr_pms_score
    ?? sub.skip_level_score
    ?? sub.manager_score
    ?? sub.self_score
    ?? null;
}

interface SubmissionRow {
  final_score: number | null;
  management_score: number | null;
  auditor_score: number | null;
  hr_pms_score: number | null;
  skip_level_score: number | null;
  manager_score: number | null;
  self_score: number | null;
  is_na: boolean | null;
}

/**
 * v2.66.10.6 — Pure derive (no fetch). Reuses the submission-score map already
 * loaded by `useReviewSubmissionScoresByKpiIds` to avoid duplicate
 * `review_submissions` scans, which were the dominant cause of dashboard
 * statement timeouts (Vivek 101784 regression). Returns
 * Map<employeeId, number | null> rounded to 1 decimal.
 */
export function useEmployeeScoresForPeriod(
  periodKpis: KPI[] | undefined,
  submissionScoreMap: Map<string, SubmissionRow> | undefined,
) {
  return useMemo(() => {
    const map = new Map<string, number | null>();
    if (!periodKpis || !submissionScoreMap) return map;

    const empKpis = new Map<string, KPI[]>();
    periodKpis.forEach(k => {
      const list = empKpis.get(k.employee_id) || [];
      list.push(k);
      empKpis.set(k.employee_id, list);
    });

    empKpis.forEach((kpis, empId) => {
      let totalWeight = 0;
      let weightedSum = 0;
      let hasAnyScore = false;

      kpis.forEach(kpi => {
        const sub = submissionScoreMap.get(kpi.id);
        if (!sub || sub.is_na) return; // Exclude N/A and missing submissions

        const score = getBestScore(sub);
        if (score === null) return;

        const weight = kpi.weightage || 0;
        if (weight <= 0) return;

        weightedSum += score * weight;
        totalWeight += weight;
        hasAnyScore = true;
      });

      if (hasAnyScore && totalWeight > 0) {
        map.set(empId, Math.round((weightedSum / totalWeight) * 10) / 10);
      } else {
        map.set(empId, null);
      }
    });

    return map;
  }, [periodKpis, submissionScoreMap]);
}
