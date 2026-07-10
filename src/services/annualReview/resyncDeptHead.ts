import { supabase } from '@/integrations/supabase/client';

/**
 * Push the currently-configured Department Head onto every non-finalized
 * Annual Review instance of that department in the given cycle, provided
 * the review has not yet advanced past the dept-head stage.
 *
 * Server-side (RPC `resync_annual_review_dept_head`) enforces admin/hr_pms
 * authorization and writes an audit-log row per invocation.
 */
export interface ResyncDeptHeadResult {
  updated: number;
  skipped: number;
  new_head_id: string;
}

export async function resyncAnnualReviewDeptHead(
  cycleId: string,
  deptId: string,
): Promise<ResyncDeptHeadResult> {
  const { data, error } = await supabase.rpc('resync_annual_review_dept_head' as any, {
    p_cycle_id: cycleId,
    p_dept_id: deptId,
  });
  if (error) throw error;
  const row = (data ?? {}) as Partial<ResyncDeptHeadResult>;
  return {
    updated: Number(row.updated ?? 0),
    skipped: Number(row.skipped ?? 0),
    new_head_id: String(row.new_head_id ?? ''),
  };
}