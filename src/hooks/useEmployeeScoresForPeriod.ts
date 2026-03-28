import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
  kpi_id: string;
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
 * Batch-fetches review_submissions for the given periodKpis and computes
 * a weighted average overall score per employee.
 *
 * Returns Map<employeeId, number | null> where the number is rounded to 1 decimal.
 */
export function useEmployeeScoresForPeriod(periodKpis: KPI[] | undefined) {
  // Collect KPI IDs for the query
  const kpiIds = useMemo(() => {
    if (!periodKpis || periodKpis.length === 0) return [];
    return periodKpis.map(k => k.id);
  }, [periodKpis]);

  // Fetch submissions in batches of 500
  const { data: submissions } = useQuery({
    queryKey: ['employee-scores-submissions', kpiIds.slice(0, 20), kpiIds.length],
    queryFn: async () => {
      if (kpiIds.length === 0) return [];
      
      const BATCH_SIZE = 500;
      const allSubs: SubmissionRow[] = [];
      
      for (let i = 0; i < kpiIds.length; i += BATCH_SIZE) {
        const batch = kpiIds.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase
          .from('review_submissions')
          .select('kpi_id, final_score, management_score, auditor_score, hr_pms_score, skip_level_score, manager_score, self_score, is_na')
          .in('kpi_id', batch);
        
        if (error) {
          console.error('Failed to fetch submissions for scores:', error);
          continue;
        }
        if (data) allSubs.push(...(data as SubmissionRow[]));
      }
      
      return allSubs;
    },
    enabled: kpiIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Compute weighted average per employee
  const scoreMap = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!periodKpis || !submissions) return map;

    // Build kpiId → submission lookup
    const subMap = new Map<string, SubmissionRow>();
    submissions.forEach(s => subMap.set(s.kpi_id, s));

    // Group KPIs by employee
    const empKpis = new Map<string, KPI[]>();
    periodKpis.forEach(k => {
      const list = empKpis.get(k.employee_id) || [];
      list.push(k);
      empKpis.set(k.employee_id, list);
    });

    // Calculate weighted average per employee
    empKpis.forEach((kpis, empId) => {
      let totalWeight = 0;
      let weightedSum = 0;
      let hasAnyScore = false;

      kpis.forEach(kpi => {
        const sub = subMap.get(kpi.id);
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
  }, [periodKpis, submissions]);

  return scoreMap;
}
