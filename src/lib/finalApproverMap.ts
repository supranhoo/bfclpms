/**
 * Final Approver resolver — SSOT for "which role is the last approving
 * stage in an employee's period-resolved workflow".
 *
 * Used by the KPI Scorecard Detail report to render the "Final Approver"
 * column on-screen and in single-month + range exports.
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';
import { CHAIN_STAGE_LABEL, type ChainStage } from '@/lib/workflowResolver';

const STAGE_TO_CHAIN: Record<string, ChainStage> = {
  self_review: 'self',
  manager_check: 'manager',
  functional_manager_check: 'functional_manager',
  skip_level_check: 'skip_level',
  hr_pms_review: 'hr_pms',
  audit: 'auditor',
  management_review: 'management',
};

export const NO_APPROVER_LABEL = '—';

/**
 * Given the ordered `templateStages` for one employee, return the
 * human-readable role label of the last non-self stage in the workflow.
 * Falls back to em-dash when no approving stage can be determined.
 */
export function getFinalApproverLabel(templateStages: string[] | null | undefined): string {
  if (!templateStages || templateStages.length === 0) return NO_APPROVER_LABEL;
  for (let i = templateStages.length - 1; i >= 0; i--) {
    const stage = templateStages[i];
    const chain = STAGE_TO_CHAIN[stage];
    if (chain && chain !== 'self') return CHAIN_STAGE_LABEL[chain];
  }
  return NO_APPROVER_LABEL;
}

/**
 * Fetch the `employee_id → final approver label` map for one (period, year).
 * Batches `get_employee_workflow_info` in groups of 25 to stay within RPC
 * concurrency limits — same pattern as `useWorkflowResolution`.
 */
export async function fetchFinalApproverMap(
  period: string,
  year: number,
): Promise<Map<string, string>> {
  const profiles = await fetchAllPaged<{ id: string }>((from, to) =>
    supabase
      .from('profiles')
      .select('id')
      .eq('is_active', true)
      .range(from, to),
  );

  const map = new Map<string, string>();
  const BATCH = 25;
  for (let i = 0; i < profiles.length; i += BATCH) {
    const slice = profiles.slice(i, i + BATCH);
    const infos = await Promise.all(
      slice.map(async (p) => {
        const { data, error } = await supabase.rpc(
          'get_employee_workflow_info' as any,
          {
            employee_uuid: p.id,
            p_review_period: period,
            p_review_year: year,
          } as any,
        );
        if (error) throw error;
        const row = (data && (data as any[])[0]) || null;
        return { id: p.id, stages: (row?.stages as string[]) ?? [] };
      }),
    );
    for (const { id, stages } of infos) {
      map.set(id, getFinalApproverLabel(stages));
    }
  }
  return map;
}