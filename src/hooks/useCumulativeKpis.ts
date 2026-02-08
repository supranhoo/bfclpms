import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  calculateCumulativeScore, 
  calculateTrendFromPeriodScores,
  type AggregatedKpi,
  type PeriodScore,
  type TrendDirection 
} from '@/lib/cumulativeScoring';

export interface CumulativeKpisResult {
  /** All raw KPIs across the period range */
  allKpis: any[];
  /** Aggregated by KPI template (same kra_name + kpi_name + employee_id) */
  aggregatedKpis: AggregatedKpi[];
  /** Period summary statistics */
  periodSummary: {
    totalPeriods: number;
    periodsWithData: number;
    startPeriod: string;
    startYear: number;
    endPeriod: string;
    endYear: number;
  };
  /** Loading and error states */
  isLoading: boolean;
  error: Error | null;
}

interface UseCumulativeKpisOptions {
  employeeId: string;
  periodRanges: Array<{ month: string; year: number }>;
  enabled?: boolean;
}

/**
 * Hook to fetch and aggregate KPIs across multiple periods
 */
export function useCumulativeKpis({
  employeeId,
  periodRanges,
  enabled = true,
}: UseCumulativeKpisOptions): CumulativeKpisResult {
  
  const queryResult = useQuery({
    queryKey: ['cumulative-kpis', employeeId, periodRanges],
    queryFn: async () => {
      if (!employeeId || periodRanges.length === 0) {
        return { allKpis: [], aggregatedKpis: [], periodSummary: null };
      }

      // Build OR conditions for each period
      const periodConditions = periodRanges.map(({ month, year }) => 
        `and(review_period.eq.${month},review_year.eq.${year})`
      ).join(',');

      const { data: kpis, error } = await supabase
        .from('kpis')
        .select(`
          *,
          category:kra_categories(*),
          submission:review_submissions(*)
        `)
        .eq('employee_id', employeeId)
        .or(periodConditions);

      if (error) throw error;

      return { allKpis: kpis || [], periodRanges };
    },
    enabled: enabled && !!employeeId && periodRanges.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Process and aggregate the data
  const result = processKpiData(
    queryResult.data?.allKpis || [],
    periodRanges
  );

  return {
    ...result,
    isLoading: queryResult.isLoading,
    error: queryResult.error as Error | null,
  };
}

/**
 * Process raw KPI data into aggregated format
 */
function processKpiData(
  allKpis: any[],
  periodRanges: Array<{ month: string; year: number }>
): Omit<CumulativeKpisResult, 'isLoading' | 'error'> {
  if (allKpis.length === 0 || periodRanges.length === 0) {
    return {
      allKpis: [],
      aggregatedKpis: [],
      periodSummary: {
        totalPeriods: periodRanges.length,
        periodsWithData: 0,
        startPeriod: periodRanges[0]?.month || '',
        startYear: periodRanges[0]?.year || new Date().getFullYear(),
        endPeriod: periodRanges[periodRanges.length - 1]?.month || '',
        endYear: periodRanges[periodRanges.length - 1]?.year || new Date().getFullYear(),
      },
    };
  }

  // Group KPIs by template key (kra_name + kpi_name + category_id)
  const kpiGroups = new Map<string, any[]>();
  
  allKpis.forEach(kpi => {
    const key = `${kpi.kra_name}|${kpi.kpi_name}|${kpi.category_id}`;
    if (!kpiGroups.has(key)) {
      kpiGroups.set(key, []);
    }
    kpiGroups.get(key)!.push(kpi);
  });

  // Aggregate each group
  const aggregatedKpis: AggregatedKpi[] = [];
  
  kpiGroups.forEach((kpis, key) => {
    const [kra_name, kpi_name, category_id] = key.split('|');
    const firstKpi = kpis[0];
    
    // Extract scores for each period
    const periodScores: PeriodScore[] = kpis.map(kpi => {
      const submission = kpi.submission;
      // Score fallback chain: final_score -> manager_score -> auditor_score -> self_score
      let score: number | null = null;
      if (submission) {
        score = submission.final_score 
          ?? submission.manager_score 
          ?? submission.auditor_score 
          ?? submission.self_score 
          ?? null;
      }
      
      return {
        period: kpi.review_period,
        year: kpi.review_year,
        score,
        weightage: kpi.weightage || 0,
      };
    });

    // Calculate average score
    const avgScore = calculateCumulativeScore(
      periodScores.map(ps => ({ score: ps.score, weightage: ps.weightage }))
    );

    // Calculate trend
    const trend = calculateTrendFromPeriodScores(periodScores);

    // Count submissions with actual scores
    const totalSubmissions = periodScores.filter(ps => ps.score !== null).length;

    aggregatedKpis.push({
      kpi_name,
      kra_name,
      category_id,
      employee_id: firstKpi.employee_id,
      avgScore,
      totalSubmissions,
      periodScores,
      trend,
      weightage: firstKpi.weightage || 0,
    });
  });

  // Calculate period summary
  const periodsWithData = new Set(
    allKpis.map(kpi => `${kpi.review_period}|${kpi.review_year}`)
  ).size;

  return {
    allKpis,
    aggregatedKpis,
    periodSummary: {
      totalPeriods: periodRanges.length,
      periodsWithData,
      startPeriod: periodRanges[0].month,
      startYear: periodRanges[0].year,
      endPeriod: periodRanges[periodRanges.length - 1].month,
      endYear: periodRanges[periodRanges.length - 1].year,
    },
  };
}

/**
 * Hook variant for team/management views - fetches for multiple employees
 */
export function useCumulativeTeamKpis({
  employeeIds,
  periodRanges,
  enabled = true,
}: {
  employeeIds: string[];
  periodRanges: Array<{ month: string; year: number }>;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['cumulative-team-kpis', employeeIds, periodRanges],
    queryFn: async () => {
      if (employeeIds.length === 0 || periodRanges.length === 0) {
        return [];
      }

      const periodConditions = periodRanges.map(({ month, year }) => 
        `and(review_period.eq.${month},review_year.eq.${year})`
      ).join(',');

      const { data, error } = await supabase
        .from('kpis')
        .select(`
          *,
          category:kra_categories(*),
          submission:review_submissions(*),
          employee:profiles(id, full_name, email, employee_code, designation)
        `)
        .in('employee_id', employeeIds)
        .or(periodConditions);

      if (error) throw error;
      return data || [];
    },
    enabled: enabled && employeeIds.length > 0 && periodRanges.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
