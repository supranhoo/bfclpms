import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PropagationPreviewBreakdownItem {
  kpi_id: string;
  employee_name: string | null;
  employee_code: string | null;
  current_status: string;
  will_advance: boolean;
  reason:
    | 'eligible'
    | 'not_in_kra_set'
    | 'kpi_not_found'
    | 'reviewer_locked'
    | 'self_review_existing';
  current_achieved?: number | null;
  current_self_score?: number | null;
  new_achieved?: number | null;
  new_self_score?: number | null;
  value_changes?: boolean;
}

export interface PropagationPreviewResult {
  total: number;
  will_advance: number;
  will_skip: number;
  breakdown: PropagationPreviewBreakdownItem[];
}

export type OverwritePolicy = 'safe' | 'pre_review_only' | 'force_pre_terminal';

interface PreviewArgs {
  kpiIds: string[];
  newAchieved?: number | null;
  newSelfScore?: number | null;
  overwritePolicy?: OverwritePolicy;
}

/**
 * Phase A4: Read-only preview of which KPIs would actually advance
 * if Propagate were clicked right now. Mirrors the eligibility logic
 * inside propagate_org_kpi_value, including the tiered overwrite policy
 * (safe / pre_review_only / force_pre_terminal — ADR-053).
 */
export function usePreviewOrgKpiPropagation() {
  return useMutation<PropagationPreviewResult, Error, PreviewArgs>({
    mutationFn: async ({
      kpiIds,
      newAchieved = null,
      newSelfScore = null,
      overwritePolicy = 'pre_review_only',
    }): Promise<PropagationPreviewResult> => {
      if (!kpiIds || kpiIds.length === 0) {
        return { total: 0, will_advance: 0, will_skip: 0, breakdown: [] };
      }
      const { data, error } = await supabase.rpc('preview_org_kpi_propagation', {
        p_kpi_ids: kpiIds,
        p_new_value: newAchieved,
        p_new_self_score: newSelfScore,
        p_overwrite_policy: overwritePolicy,
      });
      if (error) throw error;
      return data as unknown as PropagationPreviewResult;
    },
  });
}
