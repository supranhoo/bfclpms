import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to detect KPIs that were sent back from Management to Auditor.
 * Returns a Set of KPI IDs that have a MANAGEMENT_SENT_BACK_TO_AUDITOR audit log entry.
 */
export function useSentBackKpis(kpiIds: string[]) {
  return useQuery({
    queryKey: ['sent-back-kpis', kpiIds],
    queryFn: async () => {
      if (!kpiIds.length) return new Set<string>();

      const { data, error } = await supabase
        .from('kpi_audit_logs')
        .select('kpi_id')
        .in('kpi_id', kpiIds)
        .eq('action', 'MANAGEMENT_SENT_BACK_TO_AUDITOR');

      if (error) throw error;

      return new Set<string>(data?.map(row => row.kpi_id) || []);
    },
    enabled: kpiIds.length > 0,
  });
}
