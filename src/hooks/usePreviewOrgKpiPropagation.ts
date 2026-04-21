import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PropagationPreviewBreakdownItem {
  kpi_id: string;
  employee_name: string | null;
  employee_code: string | null;
  current_status: string;
  will_advance: boolean;
  reason: 'eligible' | 'not_in_kra_set' | 'kpi_not_found';
}

export interface PropagationPreviewResult {
  total: number;
  will_advance: number;
  will_skip: number;
  breakdown: PropagationPreviewBreakdownItem[];
}

/**
 * Phase A4: Read-only preview of which KPIs would actually advance
 * if Propagate were clicked right now. Mirrors the eligibility logic
 * inside the patched propagate_org_kpi_value RPC (kra_set only).
 */
export function usePreviewOrgKpiPropagation() {
  return useMutation<PropagationPreviewResult, Error, { kpiIds: string[] }>({
    mutationFn: async ({ kpiIds }): Promise<PropagationPreviewResult> => {
      if (!kpiIds || kpiIds.length === 0) {
        return { total: 0, will_advance: 0, will_skip: 0, breakdown: [] };
      }
      const { data, error } = await supabase.rpc('preview_org_kpi_propagation', {
        p_kpi_ids: kpiIds,
      });
      if (error) throw error;
      return data as unknown as PropagationPreviewResult;
    },
  });
}
