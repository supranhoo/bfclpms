import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ManagerKpiScoreParams {
  employeeId: string;
  kpiName: string;
  reviewPeriod: string | null;
  reviewYear: number | null;
}

interface ManagerKpiScoreResult {
  managerName: string;
  finalScore: number | null;
  achievedValue: number | null;
  isLoading: boolean;
}

export function useManagerKpiScore({
  employeeId,
  kpiName,
  reviewPeriod,
  reviewYear,
}: ManagerKpiScoreParams): ManagerKpiScoreResult {
  const { data, isLoading } = useQuery({
    queryKey: ['manager-kpi-score', employeeId, kpiName, reviewPeriod, reviewYear],
    queryFn: async () => {
      // Step 1: Get reporting manager ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('reporting_manager_id')
        .eq('id', employeeId)
        .single();

      const managerId = profile?.reporting_manager_id;
      if (!managerId) return null;

      // Step 2: Get manager's name
      const { data: managerProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', managerId)
        .single();

      if (!managerProfile) return null;

      // Step 3: Find manager's matching approved KPI
      const { data: managerKpi } = await supabase
        .from('kpis')
        .select('id')
        .eq('employee_id', managerId)
        .eq('kpi_name', kpiName)
        .eq('review_period', reviewPeriod!)
        .eq('review_year', reviewYear!)
        .eq('status', 'approved')
        .maybeSingle();

      if (!managerKpi) return null;

      // Step 4: Get submission scores
      const { data: submission } = await supabase
        .from('review_submissions')
        .select('final_score, achieved_value')
        .eq('kpi_id', managerKpi.id)
        .maybeSingle();

      return {
        managerName: managerProfile.full_name || managerProfile.email,
        finalScore: submission?.final_score ?? null,
        achievedValue: submission?.achieved_value ?? null,
      };
    },
    enabled: !!employeeId && !!kpiName && !!reviewPeriod && !!reviewYear,
    staleTime: 5 * 60 * 1000,
  });

  return {
    managerName: data?.managerName || '',
    finalScore: data?.finalScore ?? null,
    achievedValue: data?.achievedValue ?? null,
    isLoading,
  };
}
