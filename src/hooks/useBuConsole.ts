/**
 * ADR-259 — BU Performance Console (Beta) data hooks.
 *
 * Every read goes through a SECURITY DEFINER RPC (`bu_console_*`) — the page
 * never scans `kpis` / `review_submissions` directly. Nothing hydrates until
 * the caller explicitly enables the query (click-to-load).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const BU_CONSOLE_FLAG_KEY = 'feature_bu_console';

export interface BuConsoleKpiNode {
  kpi_key: string;
  kpi_name: string;
  kpi_rows: number;
  employee_count: number;
  is_org_level: boolean;
}

export interface BuConsoleKraNode {
  kra_key: string;
  kra_name: string;
  kpi_count: number;
  kpis: BuConsoleKpiNode[];
}

export interface BuConsoleCategoryNode {
  category_id: string;
  category_name: string;
  kra_count: number;
  kpi_count: number;
  kras: BuConsoleKraNode[];
}

export interface BuConsoleTree {
  authorized: boolean;
  period: string;
  year: number;
  categories: BuConsoleCategoryNode[];
}

export interface BuConsoleEmployeeRow {
  kpi_id: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  department_id: string | null;
  department_name: string | null;
  business_unit_id: string | null;
  business_unit_name: string | null;
  weightage: number | null;
  target_value: number | null;
  uom: string | null;
  frequency: string | null;
  status: string | null;
  is_na: boolean | null;
  achieved_value: number | null;
  self_score: number | null;
  manager_score: number | null;
  final_score: number | null;
  final_rating: string | null;
}

export interface BuConsoleKpiDetail {
  authorized: boolean;
  total: number;
  page: number;
  page_size: number;
  definition: Record<string, unknown>;
  rows: BuConsoleEmployeeRow[];
}

export interface MergeProposal {
  id: string;
  category_id: string | null;
  canonical_kra_name: string;
  canonical_kpi_name: string;
  variant_kra_name: string;
  variant_kpi_name: string;
  similarity: number | null;
  match_type: string;
  affected_kpi_count: number;
  affected_employee_count: number;
  status: 'pending' | 'approved' | 'rejected';
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

/** Beta gate — the console stays hidden until an admin flips the flag. */
export function useBuConsoleFlag() {
  return useQuery({
    queryKey: ['admin_feature_flags', BU_CONSOLE_FLAG_KEY],
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('admin_feature_flags' as any)
        .select('value')
        .eq('key', BU_CONSOLE_FLAG_KEY)
        .maybeSingle();
      if (error) throw error;
      const raw = (data as any)?.value;
      if (raw == null) return false;
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'string') return raw === 'true';
      return !!raw.enabled;
    },
  });
}

export interface BuConsoleScope {
  period: string;
  year: number;
  buIds: string[];
  deptIds: string[];
}

export function useBuConsoleTree(scope: BuConsoleScope | null) {
  return useQuery({
    queryKey: ['bu-console-tree', scope],
    enabled: !!scope,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async (): Promise<BuConsoleTree> => {
      const { data, error } = await supabase.rpc('bu_console_tree' as any, {
        p_period: scope!.period,
        p_year: scope!.year,
        p_bu_ids: scope!.buIds.length ? scope!.buIds : null,
        p_dept_ids: scope!.deptIds.length ? scope!.deptIds : null,
      });
      if (error) throw error;
      return (data ?? { authorized: false, categories: [] }) as unknown as BuConsoleTree;
    },
  });
}

export interface KpiDetailArgs extends BuConsoleScope {
  categoryId: string;
  kraName: string;
  kpiName: string;
  page: number;
}

export function useBuConsoleKpiDetail(args: KpiDetailArgs | null) {
  return useQuery({
    queryKey: ['bu-console-kpi-detail', args],
    enabled: !!args,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async (): Promise<BuConsoleKpiDetail> => {
      const { data, error } = await supabase.rpc('bu_console_kpi_detail' as any, {
        p_category_id: args!.categoryId,
        p_kra_name: args!.kraName,
        p_kpi_name: args!.kpiName,
        p_period: args!.period,
        p_year: args!.year,
        p_bu_ids: args!.buIds.length ? args!.buIds : null,
        p_dept_ids: args!.deptIds.length ? args!.deptIds : null,
        p_page: args!.page,
        p_page_size: 200,
      });
      if (error) throw error;
      return (data ?? { authorized: false, total: 0, page: 1, page_size: 200, definition: {}, rows: [] }) as unknown as BuConsoleKpiDetail;
    },
  });
}

export function useMergeProposals(status: 'pending' | 'approved' | 'rejected' = 'pending') {
  return useQuery({
    queryKey: ['kpi-merge-proposals', status],
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async (): Promise<MergeProposal[]> => {
      const { data, error } = await supabase
        .from('kpi_merge_proposals' as any)
        .select('*')
        .eq('status', status)
        .order('affected_employee_count', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as MergeProposal[];
    },
  });
}

export function useGenerateMergeProposals() {
  const qc = useQueryClient();
  return useMutation<{ inserted: number }, Error, number | undefined>({
    mutationFn: async (fuzzyThreshold?: number) => {
      const { data, error } = await supabase.rpc('bu_console_generate_merge_proposals' as any, {
        p_fuzzy_threshold: fuzzyThreshold ?? 0.55,
      });
      if (error) throw error;
      return (data ?? { inserted: 0 }) as unknown as { inserted: number };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['kpi-merge-proposals'] });
      toast.success(
        res.inserted > 0
          ? `${res.inserted} new merge proposal${res.inserted === 1 ? '' : 's'} added to the queue.`
          : 'Scan complete — no new duplicates found.',
      );
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not scan for duplicates.'),
  });
}

export function useDecideMergeProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; approve: boolean; note?: string }) => {
      const { data, error } = await supabase.rpc('bu_console_decide_merge_proposal' as any, {
        p_proposal_id: args.id,
        p_approve: args.approve,
        p_note: args.note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['kpi-merge-proposals'] });
      toast.success(vars.approve ? 'Proposal approved.' : 'Proposal rejected.');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not record the decision.'),
  });
}

/* ------------------------------------------------------------------ */
/* ADR-259 Phase 3 — one-value entry, many employees                   */
/* ------------------------------------------------------------------ */

export type GroupWritePolicy =
  | 'safe'
  | 'pre_review_only'
  | 'force_pre_terminal'
  | 'overwrite_and_stepback';

export interface GroupWritePreviewRow {
  kpi_id: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  department_name: string | null;
  business_unit_name: string | null;
  weightage: number | null;
  target_value: number | null;
  current_status: string | null;
  old_self_score: number | null;
  new_self_score: number | null;
}

export interface GroupWriteSkipRow {
  kpi_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  department_name?: string | null;
  business_unit_name?: string | null;
  current_status?: string | null;
  reason: string;
}

export interface GroupWriteResult {
  authorized: boolean;
  dry_run: boolean;
  batch_id: string | null;
  achieved_value?: number | null;
  will_write?: number;
  will_skip?: number;
  propagated?: number;
  skipped?: number;
  preview?: GroupWritePreviewRow[];
  skipped_details?: GroupWriteSkipRow[];
}

export const GROUP_WRITE_SKIP_LABELS: Record<string, string> = {
  final_score_locked: 'Final score approved — immutable (POLICY §88)',
  approved_immutable: 'Already approved — cannot be overwritten',
  reviewer_locked: 'Locked at a reviewer stage',
  not_in_kra_set: 'Past KRA-set stage (safe policy)',
  no_scoring_bands: 'No scoring bands (R1–R5) on this KPI row',
  not_authorized: 'You are not the data owner for this KPI',
  kpi_not_found: 'KPI row no longer exists',
  race_lost_during_advance: 'Row changed while saving — retry',
};

export interface GroupWriteArgs {
  categoryId: string;
  kraName: string;
  kpiName: string;
  period: string;
  year: number;
  buIds: string[];
  deptIds: string[];
  achievedValue: number | null;
  isNa: boolean;
  remarks: string | null;
  policy: GroupWritePolicy;
  dryRun: boolean;
}

async function callGroupWrite(a: GroupWriteArgs): Promise<GroupWriteResult> {
  const { data, error } = await supabase.rpc('bu_console_group_write' as any, {
    p_category_id: a.categoryId,
    p_kra_name: a.kraName,
    p_kpi_name: a.kpiName,
    p_period: a.period,
    p_year: a.year,
    p_achieved_value: a.achievedValue,
    p_bu_ids: a.buIds.length ? a.buIds : null,
    p_dept_ids: a.deptIds.length ? a.deptIds : null,
    p_is_na: a.isNa,
    p_remarks: a.remarks,
    p_overwrite_policy: a.policy,
    p_dry_run: a.dryRun,
  });
  if (error) throw error;
  return (data ?? { authorized: false, dry_run: a.dryRun, batch_id: null }) as unknown as GroupWriteResult;
}

/** Preview only — writes nothing. */
export function useGroupWritePreview() {
  return useMutation<GroupWriteResult, Error, Omit<GroupWriteArgs, 'dryRun'>>({
    mutationFn: (a) => callGroupWrite({ ...a, dryRun: true }),
    onError: (e: any) => toast.error(e?.message ?? 'Could not build the preview.'),
  });
}

/** Commits the fan-out after the admin confirms the preview. */
export function useGroupWriteCommit() {
  const qc = useQueryClient();
  return useMutation<GroupWriteResult, Error, Omit<GroupWriteArgs, 'dryRun'>>({
    mutationFn: (a) => callGroupWrite({ ...a, dryRun: false }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['bu-console-kpi-detail'] });
      qc.invalidateQueries({ queryKey: ['bu-console-tree'] });
      const written = res.propagated ?? 0;
      const skipped = res.skipped ?? 0;
      toast.success(
        `Value applied to ${written} employee${written === 1 ? '' : 's'}` +
          (skipped ? ` · ${skipped} skipped` : ''),
        { description: res.batch_id ? `Batch ${res.batch_id.slice(0, 8)}` : undefined },
      );
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not apply the value.'),
  });
}