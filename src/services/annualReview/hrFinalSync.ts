import { supabase } from '@/integrations/supabase/client';

export interface HrFinalSyncPreviewRow {
  instance_id: string;
  employee_id: string;
  current_hr_id: string | null;
  target_hr_id: string;
}

/**
 * Returns the list of in-progress annual-review instances whose HR Final
 * reviewer differs from the current HR BU Head. Admin-only at the DB layer.
 */
export async function previewHrFinalSync(cycleId: string): Promise<HrFinalSyncPreviewRow[]> {
  const { data, error } = await supabase.rpc('preview_hr_final_sync', { p_cycle_id: cycleId });
  if (error) throw error;
  return (data ?? []) as HrFinalSyncPreviewRow[];
}

/**
 * Updates `hr_id` on every eligible instance to the current HR BU Head,
 * writes an audit log per change, returns the updated row count.
 */
export async function applyHrFinalSync(cycleId: string): Promise<number> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;
  const { data, error } = await supabase.rpc('sync_hr_final_to_current_bu_head', {
    p_cycle_id: cycleId,
    p_performed_by: uid,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}