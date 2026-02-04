/**
 * Hook for calculating daily KPI aggregated scores with dynamic working days support
 * 
 * This hook handles the complexity of:
 * 1. Determining expected days based on day_count_type (working_days vs all_days)
 * 2. Fetching employee-specific working days when applicable
 * 3. Falling back to global defaults
 * 4. Calculating aggregated scores using the correct method
 */

import { useMemo } from 'react';
import { getDaysInMonth } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPI } from '@/hooks/useKpis';
import { SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';
import { useWorkingDaysPerMonth } from '@/hooks/useSystemSettings';
import { getMonthNumber } from '@/lib/frequencyUtils';
import { 
  calculateDailyAggregatedScoreWithExpectedDays, 
  DailyAggregationMethod,
  DayCountType,
  AggregationResult,
  BinaryAggregationResult
} from '@/lib/dailyAggregation';

/**
 * Fetch employee-specific working days for a given month/year
 */
export function useEmployeeWorkingDaysForMonth(
  employeeId: string | undefined,
  month: string,
  year: number
) {
  return useQuery({
    queryKey: ['employee-working-days', employeeId, month, year],
    queryFn: async () => {
      if (!employeeId) return null;
      
      const { data, error } = await supabase
        .from('employee_working_days')
        .select('working_days')
        .eq('employee_id', employeeId)
        .eq('month', month)
        .eq('year', year)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching employee working days:', error);
        return null;
      }
      
      return data?.working_days ?? null;
    },
    enabled: !!employeeId && !!month && !!year,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Calculate expected days based on day_count_type and available data
 */
export function useExpectedDays(
  dayCountType: DayCountType | null | undefined,
  month: string,
  year: number,
  employeeId?: string
): { expectedDays: number; isLoading: boolean } {
  const globalDefault = useWorkingDaysPerMonth();
  const { data: employeeWorkingDays, isLoading } = useEmployeeWorkingDaysForMonth(
    employeeId,
    month,
    year
  );

  const expectedDays = useMemo(() => {
    const type = dayCountType || 'working_days';
    
    // All calendar days mode
    if (type === 'all_days') {
      const monthNum = getMonthNumber(month);
      return getDaysInMonth(new Date(year, monthNum - 1));
    }
    
    // Working days mode - use employee-specific or global default
    return employeeWorkingDays ?? globalDefault;
  }, [dayCountType, month, year, employeeWorkingDays, globalDefault]);

  return { expectedDays, isLoading };
}

/**
 * Main hook for calculating daily aggregated score with dynamic working days
 * 
 * @param kpi - The KPI to calculate score for
 * @param submissions - Array of sub-period submissions for this KPI
 * @param month - The review month (e.g., "January")
 * @param year - The review year
 * @param method - The aggregation method to use
 */
export function useDailyAggregatedScore(
  kpi: KPI | null,
  submissions: SubPeriodSubmission[],
  month: string,
  year: number,
  method: DailyAggregationMethod
): {
  result: AggregationResult | BinaryAggregationResult | null;
  expectedDays: number;
  isLoading: boolean;
} {
  const dayCountType = (kpi?.day_count_type as DayCountType) || 'working_days';
  const { expectedDays, isLoading } = useExpectedDays(
    dayCountType,
    month,
    year,
    kpi?.employee_id
  );

  const result = useMemo(() => {
    if (!kpi || submissions.length === 0) return null;

    const values = submissions
      .filter(s => s.achieved_value !== null)
      .map(s => s.achieved_value as number);

    const isBinaryKpi = kpi.uom_type === 'binary';

    return calculateDailyAggregatedScoreWithExpectedDays(
      values,
      method,
      expectedDays,
      isBinaryKpi
    );
  }, [kpi, submissions, method, expectedDays]);

  return { result, expectedDays, isLoading };
}

/**
 * Simplified hook that just returns the aggregated score value
 */
export function useDailyAggregatedScoreValue(
  kpi: KPI | null,
  submissions: SubPeriodSubmission[],
  month: string,
  year: number,
  method: DailyAggregationMethod
): number | null {
  const { result } = useDailyAggregatedScore(kpi, submissions, month, year, method);
  return result?.score ?? null;
}
