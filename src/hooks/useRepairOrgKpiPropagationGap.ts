import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface DiagnoseGapRow {
  kpi_id: string;
  employee_id: string;
  full_name: string | null;
  employee_code: string | null;
  department_name: string | null;
  kpi_status: string;
  okv_status: string | null;
  okv_achieved: number | null;
  okv_is_na: boolean;
  has_review_submission: boolean;
  rs_self_score: number | null;
  classification:
    | 'already_propagated'
    | 'missing_staging_value'
    | 'staging_value_blank'
    | 'reviewer_locked'
    | 'eligible_to_repair';
  reason: string;
}

export interface RepairResult {
  repaired: number;
  reviewer_locked: number;
  staging_blank: number;
  missing_staging: number;
  already_propagated: number;
  repaired_employees: Array<{ kpi_id: string; employee_name: string | null; self_score: number | null }>;
}

interface ScopeRef {
  categoryId: string;
  kraName: string;
  kpiName: string;
  reviewPeriod: string;
  reviewYear: number;
}

/**
 * Read-only diagnostic. Returns one row per mapped employee for the given
 * org-level KPI scope, classifying why each row is or isn't eligible to be
 * propagated to review_submissions. Backed by SECURITY DEFINER RPC so that
 * data owners and admins see the canonical universe (not the RLS-limited
 * subset).
 *
 * RCA-2026-05-08: per-employee scoped propagation iterated only the rows
 * the data hook had loaded. Rows hidden from the caller's RLS view were
 * silently never propagated. This hook + the repair RPC close that gap.
 */
export function useDiagnoseOrgKpiGap() {
  return useMutation<DiagnoseGapRow[], Error, ScopeRef>({
    mutationFn: async (params) => {
      const { data, error } = await supabase.rpc('diagnose_org_kpi_propagation_gap', {
        p_category_id: params.categoryId,
        p_kra_name: params.kraName,
        p_kpi_name: params.kpiName,
        p_review_period: params.reviewPeriod,
        p_review_year: params.reviewYear,
      });
      if (error) throw error;
      return (data ?? []) as DiagnoseGapRow[];
    },
  });
}

/**
 * Server-side repair pass. Writes review_submissions, advances kpis.status,
 * marks org_kpi_values.status='propagated' and emits an audit log entry for
 * every row that:
 *   - has an entered staging value (or is_na)
 *   - has no scorecard row yet
 *   - is not workflow-locked by a reviewer
 *
 * Only admins or the assigned data owner for the (category, kra, kpi) tuple
 * are authorized.
 */
export function useRepairOrgKpiGap() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<RepairResult, Error, ScopeRef>({
    mutationFn: async (params) => {
      const { data, error } = await supabase.rpc('repair_org_kpi_entered_unpropagated_rows', {
        p_category_id: params.categoryId,
        p_kra_name: params.kraName,
        p_kpi_name: params.kpiName,
        p_review_period: params.reviewPeriod,
        p_review_year: params.reviewYear,
      });
      if (error) throw error;
      return data as unknown as RepairResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-submission-fallback'] });

      if (result.repaired > 0) {
        const names = (result.repaired_employees || [])
          .slice(0, 5)
          .map((e) => e.employee_name || 'Unknown')
          .join(', ');
        const more = result.repaired_employees.length > 5
          ? ` +${result.repaired_employees.length - 5} more`
          : '';
        toast({
          title: `Repaired ${result.repaired} employee KPI(s)`,
          description: `Scorecard values written for: ${names}${more}.`,
        });
      } else {
        toast({
          title: 'Nothing to repair',
          description: `Already propagated: ${result.already_propagated}, locked by reviewer: ${result.reviewer_locked}, staging blank: ${result.staging_blank}, no staging value: ${result.missing_staging}.`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Repair failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
