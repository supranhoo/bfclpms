/**
 * ADR-161 — KRA Score Rehydrate service wrapper.
 *
 * Thin client around the SECURITY DEFINER RPCs:
 *   - annual_review_rehydrate_kra_for_cycle(cycle, mode, reason, instances?)
 *   - annual_review_rollback_kra_rehydrate_run(run_id, reason)
 *
 * All calls require Admin or HR PMS. Non-KRA templates and non-completed
 * instances are skipped server-side. See POLICY §AR-KRA-REHYDRATE.
 */
import { supabase } from '@/integrations/supabase/client';
import type { KraDriftSummary } from '@/lib/annualReview/kraDrift';

export type KraRehydrateMode = 'dry_run' | 'apply';

export interface KraRehydrateRun {
  id: string;
  cycle_id: string;
  initiated_by: string;
  mode: 'dry_run' | 'apply' | 'rollback';
  reason: string;
  rollback_of_run_id: string | null;
  instance_count: number;
  changed_count: number;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface KraRehydrateItem {
  id: string;
  run_id: string;
  instance_id: string;
  employee_id: string;
  template_id: string | null;
  old_total_score: number | null;
  old_final_rating: string | null;
  new_total_score: number | null;
  new_final_rating: string | null;
  delta_total: number | null;
  band_changed: boolean;
  applied: boolean;
  old_system_scores: Record<string, number>;
  new_system_scores: Record<string, number>;
  note: string | null;
  created_at: string;
}

export async function startKraRehydrate(input: {
  cycleId: string;
  mode: KraRehydrateMode;
  reason: string;
  instanceIds?: string[];
  /** ADR-233 — also refresh reviews that are still in progress. */
  includeInFlight?: boolean;
}): Promise<string> {
  const { data, error } = await (supabase as any).rpc(
    'annual_review_rehydrate_kra_for_cycle',
    {
      p_cycle_id: input.cycleId,
      p_mode: input.mode,
      p_reason: input.reason,
      p_instance_ids: input.instanceIds ?? null,
      p_include_in_flight: input.includeInFlight ?? false,
    },
  );
  if (error) throw error;
  return data as string;
}

/**
 * ADR-233 — how many KRA-based reviews in a cycle no longer match the latest
 * monthly KPI data, plus when the last apply run happened.
 */
export async function getKraDriftSummary(cycleId: string): Promise<KraDriftSummary> {
  const { data, error } = await (supabase as any).rpc('annual_review_kra_drift_summary', {
    p_cycle_id: cycleId,
  });
  if (error) throw error;
  return data as KraDriftSummary;
}

export interface InstanceKraDrift {
  found: boolean;
  drifted: boolean;
  slots: Array<{ slot_id: string; label: string | null; stored: number | null; computed: number | null }>;
}

/** ADR-233 — per-instance drift, used by the review form's System Scores card. */
export async function getInstanceKraDrift(instanceId: string): Promise<InstanceKraDrift> {
  const { data, error } = await (supabase as any).rpc('annual_review_kra_instance_drift', {
    p_instance_id: instanceId,
  });
  if (error) throw error;
  return data as InstanceKraDrift;
}

export async function rollbackKraRehydrateRun(runId: string, reason: string): Promise<string> {
  const { data, error } = await (supabase as any).rpc(
    'annual_review_rollback_kra_rehydrate_run',
    { p_run_id: runId, p_reason: reason },
  );
  if (error) throw error;
  return data as string;
}

export async function getKraRehydrateRun(runId: string): Promise<KraRehydrateRun | null> {
  const { data, error } = await supabase
    .from('annual_review_kra_rehydrate_runs' as any)
    .select('*')
    .eq('id', runId)
    .maybeSingle();
  if (error) throw error;
  return (data as any) ?? null;
}

export async function listKraRehydrateRuns(cycleId: string, limit = 20): Promise<KraRehydrateRun[]> {
  const { data, error } = await supabase
    .from('annual_review_kra_rehydrate_runs' as any)
    .select('*')
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as any[]) ?? [];
}

export async function listKraRehydrateItems(
  runId: string,
  opts: { page?: number; pageSize?: number; changedOnly?: boolean } = {},
): Promise<{ rows: KraRehydrateItem[]; total: number }> {
  const page = opts.page ?? 0;
  const pageSize = opts.pageSize ?? 50;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from('annual_review_kra_rehydrate_items' as any)
    .select('*', { count: 'exact' })
    .eq('run_id', runId)
    .order('band_changed', { ascending: false })
    .order('delta_total', { ascending: false, nullsFirst: false })
    .range(from, to);
  if (opts.changedOnly) {
    q = q.or('band_changed.eq.true,delta_total.neq.0');
  }
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data as any[]) ?? [], total: count ?? 0 };
}
