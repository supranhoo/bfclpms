import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * ADR-227 — read-only reconciliation diagnostic.
 *
 * Lists Org KPIs where the master `org_kpi_values` rows and the child
 * scorecards disagree (master cleared but children advanced, or vice versa).
 * That divergence is exactly what made the July 2026 bulk rollback abort.
 */
export interface OrgKpiDriftRow {
  kra_name: string;
  kpi_name: string;
  master_rows: number;
  master_propagated: number;
  children_total: number;
  children_past_kra_set: number;
}

export function useOrgKpiMasterChildDrift(
  reviewPeriod: string,
  reviewYear: number,
  enabled = true,
) {
  return useQuery({
    queryKey: ['org-kpi-master-child-drift', reviewPeriod, reviewYear],
    enabled: enabled && !!reviewPeriod && !!reviewYear,
    staleTime: 60_000,
    queryFn: async (): Promise<OrgKpiDriftRow[]> => {
      const { data, error } = await supabase.rpc('org_kpi_master_child_drift', {
        p_review_period: reviewPeriod,
        p_review_year: reviewYear,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as OrgKpiDriftRow[];
    },
  });
}
