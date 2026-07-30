/**
 * ADR-208 — low-scoring KPIs for a single employee within the PIP evaluation
 * window. Scoped to one employee × window (tens of rows) and hard-capped.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getPipThreshold } from '@/lib/pmsSettings';
import {
  filterLowScoringKpis,
  groupByKra,
  type RawKpiScoreRow,
} from '@/lib/pip/lowScoringKpis';
import type { MonthKey } from '@/hooks/useMonthlyTrend';

const MAX_ROWS = 500;

export function useLowScoringKpis(employeeId: string | undefined, months: MonthKey[]) {
  const periods = months.map(m => m.month);
  const years = [...new Set(months.map(m => m.year))];
  const monthSet = new Set(months.map(m => m.key));

  const thresholdQ = useQuery({
    queryKey: ['pip-threshold'],
    queryFn: getPipThreshold,
    staleTime: 5 * 60 * 1000,
  });

  const rowsQ = useQuery({
    queryKey: ['pip-low-scoring-kpis', employeeId, months.map(m => m.key).join(',')],
    enabled: !!employeeId && months.length > 0,
    queryFn: async (): Promise<RawKpiScoreRow[]> => {
      const { data, error } = await supabase
        .from('kpis')
        .select('id, kra_name, kpi_name, review_period, review_year, review_submissions(final_score, is_na)')
        .eq('employee_id', employeeId!)
        .in('review_period', periods)
        .in('review_year', years)
        .limit(MAX_ROWS);
      if (error) throw error;
      const out: RawKpiScoreRow[] = [];
      for (const row of (data ?? []) as any[]) {
        // Guard the month×year cross-product produced by the two `in` filters.
        if (!monthSet.has(`${row.review_period}-${row.review_year}`)) continue;
        const sub = Array.isArray(row.review_submissions)
          ? row.review_submissions[0]
          : row.review_submissions;
        out.push({
          id: row.id,
          kra_name: row.kra_name,
          kpi_name: row.kpi_name,
          review_period: row.review_period,
          review_year: row.review_year,
          final_score: sub?.final_score ?? null,
          is_na: sub?.is_na ?? false,
        });
      }
      return out;
    },
  });

  const threshold = thresholdQ.data ?? null;
  const rows = threshold == null ? [] : filterLowScoringKpis(rowsQ.data ?? [], threshold);

  return {
    threshold,
    rows,
    groups: groupByKra(rows),
    isLoading: !!employeeId && (rowsQ.isLoading || thresholdQ.isLoading),
    error: (rowsQ.error || thresholdQ.error) as Error | null,
  };
}
