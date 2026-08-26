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

/**
 * ADR-270 — a console KPI node is keyed by its structured title. Rows that
 * share a title but disagree on description / formula / scoring / target are
 * separate *variants* of the same node and are always declared, never hidden.
 */
export interface BuConsoleKpiVariant {
  variant_key: string;
  kpi_name: string;
  kpi_names: string[];
  description: string | null;
  formula: string | null;
  scoring_logic: string | null;
  target_value: number | null;
  uom: string | null;
  kpi_rows: number;
  employee_count: number;
  avg_score: number | null;
}

export interface BuConsoleKpiNode {
  kpi_key: string;
  /** Normalised title used as the group key for detail/write/advance calls. */
  title_key: string;
  /** Representative raw `kpi_name` (kept for legacy rows and audit metadata). */
  kpi_name: string;
  kpi_title: string | null;
  kpi_description: string | null;
  kpi_rows: number;
  employee_count: number;
  variant_count: number;
  weightage_values: number[] | null;
  /** ADR-296 — distinct frequencies behind this grouped KPI row. */
  frequencies?: string[] | null;
  /** ADR-296 — per-KPI cycle anchors used to resolve the due window. */
  frequency_cycle_starts?: string[] | null;
  avg_score: number | null;
  is_structured: boolean;
  is_org_level: boolean;
  variants: BuConsoleKpiVariant[];
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
  /** ADR-281 — distinct employees in the loaded scope (never a row sum). */
  employee_total?: number | null;
  categories: BuConsoleCategoryNode[];
}

export interface BuConsoleEmployeeRow extends BuConsoleEmployeeRowExtras {
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
  variant_key: string | null;
  kpi_title: string | null;
  kpi_description: string | null;
  kpi_formula: string | null;
  kpi_scoring_logic: string | null;
  achieved_value: number | null;
  self_score: number | null;
  manager_score: number | null;
  final_score: number | null;
  final_rating: string | null;
}

/** ADR-275 — operational fields the console can now also read and tune. */
export interface BuConsoleEmployeeRowExtras {
  frequency_cycle_start: string | null;
  sub_frequency: string | null;
  day_count_type: string | null;
  is_frequency_locked: boolean | null;
  require_resubmit_reason: boolean | null;
  is_org_level: boolean | null;
  org_level_scope: string | null;
  ref_code: string | null;
  criteria: string | null;
  source_of_data: string | null;
  uom_type: string | null;
  threshold_mode: string | null;
  /** ADR-282 — group-owned scoring options for binary / tiered KPIs. */
  qualitative_options?: unknown;
  r0: string | null; r1: string | null; r2: string | null;
  r3: string | null; r4: string | null; r5: string | null;
  /** Field names already tuned for this employee (protected from group edits). */
  override_fields: string[];
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

/**
 * ADR-264 — every console surface that can exceed its display cap must expose
 * the true total and label the cut. Shared shape for the paged RPCs.
 */
export interface MergeProposalPage {
  authorized: boolean;
  rows: MergeProposal[];
  total: number;
  page: number;
  page_size: number;
}

/** Detail lists in group previews are capped; counts never are. */
export interface SkipSummaryEntry {
  reason: string;
  count: number;
}

export const GROUP_PREVIEW_DETAIL_LIMIT = 500;

/** Above this many affected employees a group action needs a typed confirmation. */
export const GROUP_ACTION_CONFIRM_THRESHOLD = 2000;

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
  /** ADR-265 — scope may additionally be narrowed by division and reporting manager. */
  divisionIds?: string[];
  managerIds?: string[];
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
        p_division_ids: scope!.divisionIds?.length ? scope!.divisionIds : null,
        p_manager_ids: scope!.managerIds?.length ? scope!.managerIds : null,
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
  /** ADR-270 — group by structured title when present. */
  titleKey?: string | null;
  kpiTitle?: string | null;
  /** Narrow every read/write to one variant of the title group. */
  variantKey?: string | null;
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
        p_division_ids: args!.divisionIds?.length ? args!.divisionIds : null,
        p_manager_ids: args!.managerIds?.length ? args!.managerIds : null,
        p_page: args!.page,
        p_page_size: 200,
        p_title_key: args!.titleKey ?? null,
        p_variant_key: args!.variantKey ?? null,
      });
      if (error) throw error;
      return (data ?? { authorized: false, total: 0, page: 1, page_size: 200, definition: {}, rows: [] }) as unknown as BuConsoleKpiDetail;
    },
  });
}

/**
 * ADR-264 — server-paged (200/page) with a true total. Replaces the former
 * direct table read that silently stopped at 500 rows.
 */
export function useMergeProposals(status: 'pending' | 'approved' | 'rejected' = 'pending', page = 1) {
  return useQuery({
    queryKey: ['kpi-merge-proposals', status, page],
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async (): Promise<MergeProposalPage> => {
      const { data, error } = await supabase.rpc('bu_console_merge_proposal_list' as any, {
        p_status: status,
        p_page: page,
        p_page_size: 200,
      });
      if (error) throw error;
      return (data ?? { authorized: false, rows: [], total: 0, page: 1, page_size: 200 }) as unknown as MergeProposalPage;
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
    onError: (e: any) =>
      toast.error('Duplicate scan could not run', {
        description: e?.message ?? 'Unexpected error while scanning for duplicate KPI names.',
      }),
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

/**
 * ADR-313 — bulk decision. Clears whole duplicate groups in one call instead
 * of one pair at a time; the server still records a decision per proposal.
 */
export function useDecideMergeProposalsBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { ids: string[]; approve: boolean; note?: string }) => {
      const { data, error } = await supabase.rpc('bu_console_decide_merge_proposals' as any, {
        p_ids: args.ids,
        p_approve: args.approve,
        p_note: args.note ?? null,
      });
      if (error) throw error;
      return (data ?? { requested: 0, decided: 0, skipped: 0 }) as unknown as {
        requested: number;
        decided: number;
        skipped: number;
      };
    },
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['kpi-merge-proposals'] });
      toast.success(
        `${res.decided} proposal${res.decided === 1 ? '' : 's'} ${vars.approve ? 'approved' : 'rejected'}.`,
        res.skipped > 0 ? { description: `${res.skipped} were already decided.` } : undefined,
      );
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not record the decisions.'),
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
  variant_count?: number;
  detail_limit?: number;
  detail_truncated?: boolean;
  skip_summary?: SkipSummaryEntry[];
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
  divisionIds?: string[];
  managerIds?: string[];
  achievedValue: number | null;
  isNa: boolean;
  remarks: string | null;
  policy: GroupWritePolicy;
  dryRun: boolean;
  titleKey?: string | null;
  variantKey?: string | null;
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
    p_division_ids: a.divisionIds?.length ? a.divisionIds : null,
    p_manager_ids: a.managerIds?.length ? a.managerIds : null,
    p_is_na: a.isNa,
    p_remarks: a.remarks,
    p_overwrite_policy: a.policy,
    p_dry_run: a.dryRun,
    p_title_key: a.titleKey ?? null,
    p_variant_key: a.variantKey ?? null,
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
/* ------------------------------------------------------------------ */
/* ADR-262 Phase 4 — group stage approval                              */
/* ------------------------------------------------------------------ */

/** Stages the console can complete in bulk. Final approval stays per-employee. */
export const GROUP_ADVANCE_STAGES: { value: string; label: string }[] = [
  { value: 'self_review', label: 'Self review' },
  { value: 'manager_check', label: 'Manager check' },
  { value: 'functional_manager_check', label: 'Functional manager check' },
  { value: 'audit', label: 'Audit' },
  { value: 'skip_level_check', label: 'Skip-level check' },
  { value: 'hr_pms_review', label: 'HR PMS review' },
  { value: 'management_review', label: 'Management review' },
];

export const GROUP_ADVANCE_SKIP_LABELS: Record<string, string> = {
  final_score_locked: 'Final score approved — immutable (POLICY §88)',
  final_approval_not_supported: 'Next stage is final approval — not allowed from the console (beta)',
  stage_mismatch: 'Not waiting at this stage right now',
  stage_not_in_workflow: 'This stage is not part of the employee’s workflow',
  status_not_in_workflow: 'Current status is not part of the resolved workflow',
  terminal_stage: 'Already at the last stage of the workflow',
  no_workflow: 'No workflow resolved for this employee',
  no_submission: 'No submission row yet — enter a value first',
  not_scored: 'No score to carry forward',
};

export interface GroupAdvancePreviewRow {
  kpi_id: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  department_name: string | null;
  business_unit_name: string | null;
  weightage: number | null;
  current_status: string | null;
  next_status: string | null;
  carry_forward_score: number | null;
  is_na: boolean;
}

export interface GroupAdvanceResult {
  authorized: boolean;
  dry_run: boolean;
  batch_id: string | null;
  target_stage?: string;
  will_advance?: number;
  will_skip?: number;
  advanced?: number;
  skipped?: number;
  variant_count?: number;
  detail_limit?: number;
  detail_truncated?: boolean;
  skip_summary?: SkipSummaryEntry[];
  preview?: GroupAdvancePreviewRow[];
  skipped_details?: GroupWriteSkipRow[];
}

export interface GroupAdvanceArgs {
  categoryId: string;
  kraName: string;
  kpiName: string;
  period: string;
  year: number;
  buIds: string[];
  deptIds: string[];
  divisionIds?: string[];
  managerIds?: string[];
  targetStage: string;
  remarks: string | null;
  dryRun: boolean;
  titleKey?: string | null;
  variantKey?: string | null;
}

async function callGroupAdvance(a: GroupAdvanceArgs): Promise<GroupAdvanceResult> {
  const { data, error } = await supabase.rpc('bu_console_group_advance' as any, {
    p_category_id: a.categoryId,
    p_kra_name: a.kraName,
    p_kpi_name: a.kpiName,
    p_period: a.period,
    p_year: a.year,
    p_target_stage: a.targetStage,
    p_bu_ids: a.buIds.length ? a.buIds : null,
    p_dept_ids: a.deptIds.length ? a.deptIds : null,
    p_division_ids: a.divisionIds?.length ? a.divisionIds : null,
    p_manager_ids: a.managerIds?.length ? a.managerIds : null,
    p_remarks: a.remarks,
    p_dry_run: a.dryRun,
    p_title_key: a.titleKey ?? null,
    p_variant_key: a.variantKey ?? null,
  });
  if (error) throw error;
  return (data ?? { authorized: false, dry_run: a.dryRun, batch_id: null }) as unknown as GroupAdvanceResult;
}

/** Preview only — advances nothing. */
export function useGroupAdvancePreview() {
  return useMutation<GroupAdvanceResult, Error, Omit<GroupAdvanceArgs, 'dryRun'>>({
    mutationFn: (a) => callGroupAdvance({ ...a, dryRun: true }),
    onError: (e: any) => toast.error(e?.message ?? 'Could not build the approval preview.'),
  });
}

/** Commits the stage advance after the admin confirms the preview. */
export function useGroupAdvanceCommit() {
  const qc = useQueryClient();
  return useMutation<GroupAdvanceResult, Error, Omit<GroupAdvanceArgs, 'dryRun'>>({
    mutationFn: (a) => callGroupAdvance({ ...a, dryRun: false }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['bu-console-kpi-detail'] });
      qc.invalidateQueries({ queryKey: ['bu-console-tree'] });
      const moved = res.advanced ?? 0;
      const skipped = res.skipped ?? 0;
      toast.success(
        `${moved} employee${moved === 1 ? '' : 's'} moved forward` + (skipped ? ` · ${skipped} skipped` : ''),
        { description: res.batch_id ? `Batch ${res.batch_id.slice(0, 8)}` : undefined },
      );
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not advance the group.'),
  });
}

/* ------------------------------------------------------------------
 * ADR-263 — Goal objects (Phase 5).
 * Goals are an additive layer: they describe *what* a KPI definition is
 * aiming at for a scope, and can derive their current value by rolling up
 * the mapped employee rows with weightage (never a plain average).
 * ------------------------------------------------------------------ */

export type GoalEntityLevel = 'org' | 'bu' | 'department' | 'individual';
export type GoalProgressType = 'number' | 'currency' | 'percentage' | 'rollup';
export type GoalTrackingMethod = 'manual' | 'rollup' | 'source';
export type GoalSummaryRule = 'last' | 'sum' | 'avg';
export type GoalVisibility = 'public' | 'restricted' | 'custom';
/** ADR-267 — where a goal's current value comes from. */
export type GoalSource = 'kpi_rollup' | 'child_rollup' | 'manual';

export const GOAL_SOURCE_LABELS: Record<GoalSource, string> = {
  kpi_rollup: 'Rolled up from employee KPIs',
  child_rollup: 'Rolled up from sub-goals',
  manual: 'Entered manually',
};

export const GOAL_SUMMARY_RULE_LABELS: Record<GoalSummaryRule, string> = {
  last: 'Latest sub-period value',
  sum: 'Sum of sub-periods',
  avg: 'Average of sub-periods',
};

export const GOAL_TRACKING_LABELS: Record<GoalTrackingMethod, string> = {
  manual: 'Entered manually',
  rollup: 'Rolled up from mapped employees',
  source: 'Fed from a data source',
};

export interface BuGoalRow {
  id: string;
  title: string | null;
  definition_id: string | null;
  parent_goal_id: string | null;
  /** 0 = top-level goal, 1 = sub-goal. */
  depth: number;
  category_id: string | null;
  category_name: string | null;
  kra_name: string | null;
  kpi_name: string | null;
  goal_source: GoalSource;
  weight: number | null;
  entity_level: GoalEntityLevel;
  business_unit_id: string | null;
  business_unit_name: string | null;
  department_id: string | null;
  department_name: string | null;
  owner_profile_id: string | null;
  owner_name: string | null;
  review_period: string | null;
  review_year: number;
  cycle_ref: string | null;
  progress_type: GoalProgressType;
  tracking_method: GoalTrackingMethod;
  subperiod_summary_rule: GoalSummaryRule;
  visibility: GoalVisibility;
  unit: string | null;
  start_value: number | null;
  target_value: number | null;
  current_value: number | null;
  notes: string | null;
  rollup_computed_at: string | null;
}

export interface BuGoalListResult {
  authorized: boolean;
  rows: BuGoalRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface GoalListArgs {
  year: number;
  period: string | null;
  buIds: string[];
  deptIds: string[];
  categoryIds?: string[];
  page: number;
}

/** Server-paged goal list (200/page). Disabled until a scope is applied. */
export function useBuGoals(args: GoalListArgs | null) {
  return useQuery<BuGoalListResult>({
    queryKey: ['bu-console-goals', args],
    enabled: !!args,
    staleTime: 60_000,
    queryFn: async () => {
      const a = args!;
      const { data, error } = await supabase.rpc('bu_goal_list' as any, {
        p_year: a.year,
        p_period: a.period,
        p_bu_ids: a.buIds.length ? a.buIds : null,
        p_dept_ids: a.deptIds.length ? a.deptIds : null,
        p_category_ids: a.categoryIds?.length ? a.categoryIds : null,
        p_page: a.page,
        p_page_size: 200,
      });
      if (error) throw error;
      return (data ?? { authorized: false, rows: [], total: 0, page: 1, page_size: 200 }) as unknown as BuGoalListResult;
    },
  });
}

export interface GoalUpsertArgs {
  id?: string | null;
  title: string;
  categoryId: string | null;
  kraName: string | null;
  kpiNameMatch: string | null;
  goalSource: GoalSource;
  weight: number | null;
  definitionId?: string | null;
  reviewYear: number;
  reviewPeriod: string | null;
  entityLevel: GoalEntityLevel;
  businessUnitId: string | null;
  departmentId: string | null;
  ownerProfileId?: string | null;
  cycleRef?: string | null;
  progressType: GoalProgressType;
  subperiodSummaryRule: GoalSummaryRule;
  visibility: GoalVisibility;
  unit: string | null;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  parentGoalId?: string | null;
  notes?: string | null;
  /** ADR-276 — cross-functional alignment, separate from the structural parent. */
  alignsToId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export function useGoalUpsert() {
  const qc = useQueryClient();
  return useMutation<{ authorized: boolean; id?: string; error?: string }, Error, GoalUpsertArgs>({
    mutationFn: async (a) => {
      const { data, error } = await supabase.rpc('bu_goal_upsert' as any, {
        p_review_year: a.reviewYear,
        p_id: a.id ?? null,
        p_title: a.title,
        p_category_id: a.categoryId,
        p_kra_name: a.kraName,
        p_kpi_name_match: a.kpiNameMatch,
        p_goal_source: a.goalSource,
        p_weight: a.weight ?? 1,
        p_definition_id: a.definitionId ?? null,
        p_entity_level: a.entityLevel,
        p_business_unit_id: a.businessUnitId,
        p_department_id: a.departmentId,
        p_owner_profile_id: a.ownerProfileId ?? null,
        p_review_period: a.reviewPeriod,
        p_cycle_ref: a.cycleRef ?? null,
        p_progress_type: a.progressType,
        p_subperiod_summary_rule: a.subperiodSummaryRule,
        p_visibility: a.visibility,
        p_unit: a.unit,
        p_start_value: a.startValue,
        p_target_value: a.targetValue,
        p_current_value: a.currentValue,
        p_parent_goal_id: a.parentGoalId ?? null,
        p_notes: a.notes ?? null,
        p_aligns_to_id: a.alignsToId ?? null,
        p_start_date: a.startDate ?? null,
        p_end_date: a.endDate ?? null,
      });
      if (error) throw error;
      return (data ?? { authorized: false }) as any;
    },
    onSuccess: (res) => {
      if (!res.authorized) { toast.error('Only admins can save goals.'); return; }
      if (res.error) { toast.error(res.error); return; }
      qc.invalidateQueries({ queryKey: ['bu-console-goals'] });
      qc.invalidateQueries({ queryKey: ['kra-tree'] });
      toast.success('Goal saved.');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not save the goal.'),
  });
}

export interface GoalRollupResult {
  authorized: boolean;
  found?: boolean;
  goal_id?: string;
  persisted?: boolean;
  summary_rule?: GoalSummaryRule;
  tracking_method?: GoalTrackingMethod;
  goal_source?: GoalSource;
  error?: string;
  current_value: number | null;
  target_value?: number | null;
  row_count?: number;
  employee_count?: number;
  periods?: Array<{ review_period: string; weighted_value: number; row_count: number; employee_count: number }>;
  children?: Array<{ id: string; title: string | null; weight: number | null; current_value: number | null; target_value: number | null }>;
}

/** Computes (and optionally stores) a goal's current value from its children. */
export function useGoalRollup() {
  const qc = useQueryClient();
  return useMutation<GoalRollupResult, Error, { goalId: string; persist: boolean }>({
    mutationFn: async ({ goalId, persist }) => {
      const { data, error } = await supabase.rpc('bu_goal_rollup' as any, { p_goal_id: goalId, p_persist: persist });
      if (error) throw error;
      return (data ?? { authorized: false, current_value: null }) as unknown as GoalRollupResult;
    },
    onSuccess: (res, vars) => {
      if (!res.authorized) { toast.error('You cannot roll up this goal.'); return; }
      if (res.error) { toast.error(res.error); return; }
      if (vars.persist) {
        qc.invalidateQueries({ queryKey: ['bu-console-goals'] });
        qc.invalidateQueries({ queryKey: ['kra-tree'] });
        toast.success('Roll-up saved.');
      }
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not roll up the goal.'),
  });
}

export function useGoalArchive() {
  const qc = useQueryClient();
  return useMutation<{ authorized: boolean }, Error, string>({
    mutationFn: async (id) => {
      const { data, error } = await supabase.rpc('bu_goal_archive' as any, { p_id: id });
      if (error) throw error;
      return (data ?? { authorized: false }) as any;
    },
    onSuccess: (res) => {
      if (!res.authorized) { toast.error('Only admins can archive goals.'); return; }
      qc.invalidateQueries({ queryKey: ['bu-console-goals'] });
      qc.invalidateQueries({ queryKey: ['kra-tree'] });
      toast.success('Goal archived.');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not archive the goal.'),
  });
}

export interface KpiDefinitionOption {
  id: string;
  kra_name: string;
  kpi_name: string;
  uom: string | null;
}

export interface KpiDefinitionSearchResult {
  authorized: boolean;
  rows: KpiDefinitionOption[];
  /** True number of active definitions matching the search, even when `rows` is capped. */
  total: number;
  limit: number;
}

/**
 * Definition picker source for the goal form.
 * ADR-264 — returns the true match count so the UI can say when the list was cut.
 */
export function useKpiDefinitionOptions(search: string, enabled: boolean) {
  return useQuery<KpiDefinitionSearchResult>({
    queryKey: ['bu-console-definitions', search],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bu_console_definition_search' as any, {
        p_search: search.trim() || null,
        p_limit: 100,
      });
      if (error) throw error;
      return (data ?? { authorized: false, rows: [], total: 0, limit: 100 }) as unknown as KpiDefinitionSearchResult;
    },
  });
}

/** Pure helper — % progress of a goal, clamped for display. Null when unknowable. */
export function goalProgressPercent(goal: Pick<BuGoalRow, 'start_value' | 'target_value' | 'current_value'>): number | null {
  const { start_value: s, target_value: t, current_value: c } = goal;
  if (t === null || t === undefined || c === null || c === undefined) return null;
  const start = s ?? 0;
  if (t === start) return c >= t ? 100 : 0;
  const pct = ((c - start) / (t - start)) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
}

export interface GoalKraOptionsResult {
  authorized: boolean;
  kras: string[];
  kra_total: number;
  kpis: string[];
  kpi_total: number;
  limit: number;
}

/**
 * ADR-267 — the goal form picks its KRA / KPI names from the *live* review
 * data (`kpis`) rather than the master library, so a goal always anchors to
 * something employees are actually scored on.
 */
export function useGoalKraOptions(
  year: number,
  categoryId: string | null,
  kraName: string | null,
  search: string,
  enabled: boolean,
) {
  return useQuery<GoalKraOptionsResult>({
    queryKey: ['bu-console-goal-kra-options', year, categoryId, kraName, search],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bu_goal_kra_options' as any, {
        p_year: year,
        p_category_id: categoryId,
        p_kra_name: kraName,
        p_search: search.trim() || null,
        p_limit: 200,
      });
      if (error) throw error;
      return (data ?? { authorized: false, kras: [], kra_total: 0, kpis: [], kpi_total: 0, limit: 200 }) as unknown as GoalKraOptionsResult;
    },
  });
}


/* ------------------------------------------------------------------
 * ADR-274 — Group KPI definition editing with per-employee overrides.
 *
 * One KPI title maps to many employee rows. A group edit changes the
 * definition once for the whole mapped set; an individual override tunes a
 * single employee row and is then protected from later group edits.
 * Both are admin-only, both are previewed before they write, and every
 * changed field is recorded so the run can be undone.
 * ------------------------------------------------------------------ */

/** Whitelisted, admin-editable KPI definition fields (mirrors `bu_console_editable_fields()`). */
export const GROUP_EDIT_FIELDS = [
  'kpi_title', 'kpi_description', 'kpi_formula', 'kpi_scoring_logic',
  'weightage', 'target_value', 'uom', 'uom_type', 'frequency', 'threshold_mode',
  'qualitative_options', 'r5', 'r4', 'r3', 'r2', 'r1', 'r0',
  'kra_name', 'category_id', 'criteria', 'source_of_data',
  // ADR-275 — cycle anchor and operational flags.
  'frequency_cycle_start', 'day_count_type', 'is_org_level', 'org_level_scope',
  'require_resubmit_reason', 'is_frequency_locked',
  // ADR-322 — a grouped scope owns exactly one target id.
  'business_unit_id', 'location_id', 'division_id', 'pms_grade_id', 'level_id',
] as const;

export type GroupEditField = (typeof GROUP_EDIT_FIELDS)[number];

export const GROUP_EDIT_FIELD_LABELS: Record<string, string> = {
  kpi_title: 'Title',
  kpi_description: 'Description',
  kpi_formula: 'Formula',
  kpi_scoring_logic: 'Scoring logic',
  weightage: 'Weightage',
  target_value: 'Target',
  uom: 'Unit',
  uom_type: 'KPI type',
  frequency: 'Frequency',
  threshold_mode: 'Threshold mode',
  qualitative_options: 'Options',
  r5: 'Rating 5', r4: 'Rating 4', r3: 'Rating 3',
  r2: 'Rating 2', r1: 'Rating 1', r0: 'Rating 0',
  kra_name: 'KRA',
  category_id: 'Category',
  criteria: 'Direction',
  source_of_data: 'Source of data',
  frequency_cycle_start: 'Cycle anchor',
  day_count_type: 'Day counting',
  is_org_level: 'Organisation-level KPI',
  org_level_scope: 'Scope',
  require_resubmit_reason: 'Reason on resubmission',
  is_frequency_locked: 'Lock frequency after submission',
  business_unit_id: 'Business unit',
  location_id: 'Location',
  division_id: 'Division',
  pms_grade_id: 'PMS grade',
  level_id: 'Level',
};

export const GROUP_EDIT_SKIP_LABELS: Record<string, string> = {
  final_score_locked: 'Final score approved — immutable (POLICY §88)',
  past_kra_set: 'Already in review — enable "include rows already in review" to edit',
  individual_override: 'Individually overridden — tick "reset overrides" to include',
  cycle_anchor_conflict: 'The new cycle overlaps an existing cycle for this KPI',
  scoring_model_locked: 'Scoring model is group-owned — edit it for all employees (ADR-282)',
  no_change: 'Nothing changed',
  not_found: 'This KPI row no longer exists',
};

/** ADR-275 — one row per employee whose new cycle would clash with an existing one. */
export interface CycleAnchorConflictRow {
  kpi_id: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  existing_anchor: string | null;
  new_anchor: string | null;
  frequency: string | null;
}

export interface GroupEditPreviewRow {
  kpi_id: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  department_name: string | null;
  business_unit_name: string | null;
  current_status: string | null;
  variant_key: string | null;
  weightage: number | null;
  target_value: number | null;
  fields: string[];
}

export interface GroupEditWeightageRow {
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  current_total: number | null;
  new_total: number | null;
}

export interface GroupEditResult {
  authorized: boolean;
  dry_run: boolean;
  run_id: string | null;
  will_write?: number;
  will_skip?: number;
  updated?: number | null;
  detail_limit?: number;
  detail_truncated?: boolean;
  skip_summary?: SkipSummaryEntry[];
  weightage_impact?: GroupEditWeightageRow[];
  cycle_change?: boolean;
  anchor_conflicts?: CycleAnchorConflictRow[];
  preview?: GroupEditPreviewRow[];
  skipped_details?: GroupWriteSkipRow[];
}

export interface GroupEditArgs {
  categoryId: string;
  kraName: string;
  kpiName: string;
  period: string;
  year: number;
  buIds: string[];
  deptIds: string[];
  divisionIds?: string[];
  managerIds?: string[];
  titleKey?: string | null;
  variantKey?: string | null;
  /** Only the fields the admin actually changed. */
  changes: Record<string, string | null>;
  allowLocked: boolean;
  resetOverrides: boolean;
  /** ADR-321 — descriptive-only edit allowed on locked / in-review rows. */
  textOnly?: boolean;
  dryRun: boolean;
}

async function callGroupEdit(a: GroupEditArgs): Promise<GroupEditResult> {
  const { data, error } = await supabase.rpc('bu_console_group_edit_definition' as any, {
    p_category_id: a.categoryId,
    p_kra_name: a.kraName,
    p_kpi_name: a.kpiName,
    p_period: a.period,
    p_year: a.year,
    p_changes: a.changes,
    p_bu_ids: a.buIds.length ? a.buIds : null,
    p_dept_ids: a.deptIds.length ? a.deptIds : null,
    p_division_ids: a.divisionIds?.length ? a.divisionIds : null,
    p_manager_ids: a.managerIds?.length ? a.managerIds : null,
    p_title_key: a.titleKey ?? null,
    p_variant_key: a.variantKey ?? null,
    p_allow_locked: a.allowLocked,
    p_reset_overrides: a.resetOverrides,
    p_dry_run: a.dryRun,
    p_text_only: a.textOnly ?? false,
  });

  if (error) throw error;
  return (data ?? { authorized: false, dry_run: a.dryRun, run_id: null }) as unknown as GroupEditResult;
}

/** Preview only — changes nothing. */
export function useGroupEditPreview() {
  return useMutation<GroupEditResult, Error, Omit<GroupEditArgs, 'dryRun'>>({
    mutationFn: (a) => callGroupEdit({ ...a, dryRun: true }),
    onError: (e: any) => toast.error(e?.message ?? 'Could not build the edit preview.'),
  });
}

/* ------------------------------------------------------------------ */
/* ADR-291 — multi-period group edit (this month + future months)      */
/* ------------------------------------------------------------------ */

export interface GroupEditSpanArgs extends Omit<GroupEditArgs, 'dryRun' | 'period' | 'year'> {
  /** Ordered list of target periods; one RPC call per entry. */
  targets: Array<{ month: string; year: number }>;
}

export interface GroupEditSpanEntry {
  target: { month: string; year: number };
  result: GroupEditResult | null;
  error?: string | null;
}

export interface GroupEditSpanResult {
  entries: GroupEditSpanEntry[];
  /** Shared id so a multi-month rollout can be traced as one action. */
  spanId: string;
}

async function runSpan(
  a: GroupEditSpanArgs,
  dryRun: boolean,
  spanId: string,
): Promise<GroupEditSpanResult> {
  const { targets, ...rest } = a;
  const entries: GroupEditSpanEntry[] = [];
  for (const t of targets) {
    try {
      const result = await callGroupEdit({ ...rest, period: t.month, year: t.year, dryRun });
      entries.push({ target: t, result });
    } catch (e: any) {
      entries.push({ target: t, result: null, error: e?.message ?? 'Failed' });
      // A commit must not silently continue past a hard failure.
      if (!dryRun) break;
    }
  }
  return { entries, spanId };
}

/** Dry-run every target month. Writes nothing. */
export function useGroupEditSpanPreview() {
  return useMutation<GroupEditSpanResult, Error, GroupEditSpanArgs>({
    mutationFn: (a) => runSpan(a, true, crypto.randomUUID()),
    onError: (e: any) => toast.error(e?.message ?? 'Could not build the edit preview.'),
  });
}

/** Commits month by month; each month writes its own undoable run. */
export function useGroupEditSpanCommit() {
  const qc = useQueryClient();
  return useMutation<GroupEditSpanResult, Error, GroupEditSpanArgs>({
    mutationFn: (a) => runSpan(a, false, crypto.randomUUID()),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['bu-console-kpi-detail'] });
      qc.invalidateQueries({ queryKey: ['bu-console-tree'] });
      qc.invalidateQueries({ queryKey: ['bu-console-edit-runs'] });
      const ok = res.entries.filter((e) => !e.error);
      const failed = res.entries.filter((e) => e.error);
      const rows = ok.reduce((n, e) => n + Number(e.result?.updated ?? 0), 0);
      if (failed.length) {
        toast.warning(
          `${rows} row${rows === 1 ? '' : 's'} updated across ${ok.length} month${ok.length === 1 ? '' : 's'} — stopped at ${failed[0].target.month} ${failed[0].target.year}`,
          { description: failed[0].error ?? undefined },
        );
        return;
      }
      toast.success(
        `${rows} row${rows === 1 ? '' : 's'} updated across ${ok.length} month${ok.length === 1 ? '' : 's'}`,
      );
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not apply the definition edit.'),
  });
}

/** Commits the definition edit after the admin confirms the preview. */
export function useGroupEditCommit() {
  const qc = useQueryClient();
  return useMutation<GroupEditResult, Error, Omit<GroupEditArgs, 'dryRun'>>({
    mutationFn: (a) => callGroupEdit({ ...a, dryRun: false }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['bu-console-kpi-detail'] });
      qc.invalidateQueries({ queryKey: ['bu-console-tree'] });
      qc.invalidateQueries({ queryKey: ['bu-console-edit-runs'] });
      const n = res.updated ?? 0;
      toast.success(
        `${n} employee row${n === 1 ? '' : 's'} updated` +
          (res.will_skip ? ` · ${res.will_skip} skipped` : ''),
        { description: res.run_id ? `Run ${res.run_id.slice(0, 8)} — can be undone` : undefined },
      );
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not apply the definition edit.'),
  });
}

/* ------------------------------------------------------------------ */
/* ADR-315 — variance normaliser (collapse N variants into one)         */
/* ------------------------------------------------------------------ */

export interface VariantNormaliseStepArg {
  variantKey: string;
  changes: Record<string, string | null>;
}

export interface VariantNormaliseArgs
  extends Omit<GroupEditArgs, 'dryRun' | 'period' | 'year' | 'changes' | 'variantKey'> {
  /** One entry per variant that must be rewritten. */
  steps: VariantNormaliseStepArg[];
  /** Ordered target periods; each step runs once per period. */
  targets: Array<{ month: string; year: number }>;
}

export interface VariantNormaliseEntry {
  variantKey: string;
  target: { month: string; year: number };
  result: GroupEditResult | null;
  error?: string | null;
}

export interface VariantNormaliseResult {
  entries: VariantNormaliseEntry[];
  /** Shared id so the whole normalisation can be traced as one action. */
  runGroupId: string;
}

async function runNormalise(
  a: VariantNormaliseArgs,
  dryRun: boolean,
  runGroupId: string,
): Promise<VariantNormaliseResult> {
  const { steps, targets, ...rest } = a;
  const entries: VariantNormaliseEntry[] = [];
  for (const t of targets) {
    for (const s of steps) {
      try {
        const result = await callGroupEdit({
          ...rest,
          period: t.month,
          year: t.year,
          variantKey: s.variantKey,
          changes: s.changes,
          dryRun,
        });
        entries.push({ variantKey: s.variantKey, target: t, result });
      } catch (e: any) {
        entries.push({
          variantKey: s.variantKey, target: t, result: null,
          error: e?.message ?? 'Failed',
        });
        // A commit must never silently continue past a hard failure.
        if (!dryRun) return { entries, runGroupId };
      }
    }
  }
  return { entries, runGroupId };
}

/** Dry-run every variant in every target month. Writes nothing. */
export function useVariantNormalisePreview() {
  return useMutation<VariantNormaliseResult, Error, VariantNormaliseArgs>({
    mutationFn: (a) => runNormalise(a, true, crypto.randomUUID()),
    onError: (e: any) => toast.error(e?.message ?? 'Could not build the normalisation preview.'),
  });
}

/** Commits variant by variant; each call writes its own undoable run. */
export function useVariantNormaliseCommit() {
  const qc = useQueryClient();
  return useMutation<VariantNormaliseResult, Error, VariantNormaliseArgs>({
    mutationFn: (a) => runNormalise(a, false, crypto.randomUUID()),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['bu-console-kpi-detail'] });
      qc.invalidateQueries({ queryKey: ['bu-console-tree'] });
      qc.invalidateQueries({ queryKey: ['bu-console-edit-runs'] });
      const ok = res.entries.filter((e) => !e.error);
      const failed = res.entries.filter((e) => e.error);
      const rows = ok.reduce((n, e) => n + Number(e.result?.updated ?? 0), 0);
      if (failed.length) {
        toast.warning(
          `${rows} row${rows === 1 ? '' : 's'} aligned before the run stopped`,
          { description: failed[0].error ?? undefined },
        );
        return;
      }
      toast.success(
        `${rows} row${rows === 1 ? '' : 's'} aligned to one definition`,
        { description: 'Each variant wrote its own undoable run.' },
      );
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not normalise the variants.'),
  });
}


export interface RowOverrideResult {
  authorized: boolean;
  updated?: number;
  run_id?: string | null;
  reason?: string;
}

/** Single-employee override — the row is then excluded from later group edits. */
export function useRowOverride() {
  const qc = useQueryClient();
  return useMutation<RowOverrideResult, Error, { kpiId: string; changes: Record<string, string | null>; allowLocked?: boolean }>({
    mutationFn: async (a) => {
      const { data, error } = await supabase.rpc('bu_console_row_override' as any, {
        p_kpi_id: a.kpiId,
        p_changes: a.changes,
        p_allow_locked: a.allowLocked ?? false,
      });
      if (error) throw error;
      return (data ?? { authorized: false }) as unknown as RowOverrideResult;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['bu-console-kpi-detail'] });
      qc.invalidateQueries({ queryKey: ['bu-console-edit-runs'] });
      if (!res.updated) {
        toast.warning(
          res.reason ? (GROUP_EDIT_SKIP_LABELS[res.reason] ?? 'Nothing changed.') : 'Nothing changed.',
        );
        return;
      }
      toast.success('Employee row updated — marked as an individual override.');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not update this employee row.'),
  });
}

/**
 * ADR-275 — tune several employees in one undoable run.
 * Used by the inline bulk editor in the mapped-employee table.
 */
export interface BulkRowOverrideRow {
  kpi_id: string;
  changes: Record<string, string | null>;
}

export interface BulkRowOverrideResult {
  authorized: boolean;
  run_id?: string | null;
  updated?: number;
  skipped?: { kpi_id: string; reason: string }[];
}

export function useBulkRowOverrides() {
  const qc = useQueryClient();
  return useMutation<BulkRowOverrideResult, Error, { rows: BulkRowOverrideRow[]; allowLocked?: boolean }>({
    mutationFn: async (a) => {
      const { data, error } = await supabase.rpc('bu_console_bulk_row_overrides' as any, {
        p_rows: a.rows,
        p_allow_locked: a.allowLocked ?? false,
      });
      if (error) throw error;
      return (data ?? { authorized: false }) as unknown as BulkRowOverrideResult;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['bu-console-kpi-detail'] });
      qc.invalidateQueries({ queryKey: ['bu-console-edit-runs'] });
      const n = res.updated ?? 0;
      const skipped = res.skipped?.length ?? 0;
      if (n === 0) {
        toast.warning(skipped ? `Nothing written — ${skipped} row(s) skipped.` : 'Nothing changed.');
        return;
      }
      toast.success(
        `${n} employee row${n === 1 ? '' : 's'} tuned` + (skipped ? ` · ${skipped} skipped` : ''),
        { description: res.run_id ? `Run ${res.run_id.slice(0, 8)} — can be undone` : undefined },
      );
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not save these individual edits.'),
  });
}

/** Drops the override marker so the row follows group edits again. */
export function useClearRowOverrides() {
  const qc = useQueryClient();
  return useMutation<{ authorized: boolean; cleared?: number }, Error, { kpiId: string; fields?: string[] }>({
    mutationFn: async (a) => {
      const { data, error } = await supabase.rpc('bu_console_clear_row_overrides' as any, {
        p_kpi_id: a.kpiId,
        p_fields: a.fields ?? null,
      });
      if (error) throw error;
      return (data ?? { authorized: false }) as any;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['bu-console-kpi-detail'] });
      toast.success(`${res.cleared ?? 0} field(s) will follow the group definition again.`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not clear the overrides.'),
  });
}

export interface ConsoleEditRun {
  id: string;
  scope_kind: 'group' | 'row' | 'row_bulk';
  kra_name: string | null;
  kpi_name: string | null;
  review_period: string | null;
  review_year: number | null;
  fields: string[];
  affected_rows: number;
  skipped_rows: number;
  performed_by_name: string | null;
  undone_at: string | null;
  created_at: string;
}

export function useConsoleEditRuns(enabled = false, limit = 25) {
  return useQuery({
    queryKey: ['bu-console-edit-runs', limit],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<ConsoleEditRun[]> => {
      const { data, error } = await supabase.rpc('bu_console_edit_runs_list' as any, { p_limit: limit });
      if (error) throw error;
      return ((data as any)?.runs ?? []) as ConsoleEditRun[];
    },
  });
}

export function useUndoConsoleEditRun() {
  const qc = useQueryClient();
  return useMutation<{ authorized: boolean; reverted?: number; conflicts?: number; reason?: string }, Error, string>({
    mutationFn: async (runId) => {
      const { data, error } = await supabase.rpc('bu_console_undo_edit_run' as any, { p_run_id: runId });
      if (error) throw error;
      return (data ?? { authorized: false }) as any;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['bu-console-kpi-detail'] });
      qc.invalidateQueries({ queryKey: ['bu-console-tree'] });
      qc.invalidateQueries({ queryKey: ['bu-console-edit-runs'] });
      if (res.reason === 'already_undone') {
        toast.info('This run was already undone.');
        return;
      }
      toast.success(
        `${res.reverted ?? 0} row${(res.reverted ?? 0) === 1 ? '' : 's'} restored` +
          (res.conflicts ? ` · ${res.conflicts} field${res.conflicts === 1 ? '' : 's'} changed since and left as-is` : ''),
      );
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not undo this run.'),
  });
}

/* ------------------------------------------------------------------
 * ADR-276 — KRA Tree.
 * One clean cascade: Organisation → Business Unit → Department → Employee.
 * The tree is read one level at a time (`kra_tree_list`) so a wide org never
 * pulls thousands of rows in a single call, and every level is server-paged.
 * ------------------------------------------------------------------ */

export type KraStatus =
  | 'on_track' | 'at_risk' | 'behind' | 'achieved' | 'dropped'
  | 'not_started' | 'not_set';

export const KRA_STATUS_LABELS: Record<KraStatus, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  behind: 'Behind',
  achieved: 'Achieved',
  dropped: 'Dropped',
  not_started: 'Not started',
  not_set: 'No progress yet',
};

export const KRA_LEVEL_LABELS: Record<GoalEntityLevel, string> = {
  org: 'Organisation',
  bu: 'Business unit',
  department: 'Department',
  individual: 'Employee',
};

export interface KraTreeRow {
  id: string;
  title: string | null;
  parent_goal_id: string | null;
  aligns_to_id: string | null;
  aligns_to_title: string | null;
  category_id: string | null;
  category_name: string | null;
  kra_name: string | null;
  kpi_name: string | null;
  goal_source: GoalSource;
  weight: number | null;
  entity_level: GoalEntityLevel;
  business_unit_id: string | null;
  business_unit_name: string | null;
  department_id: string | null;
  department_name: string | null;
  owner_profile_id: string | null;
  owner_name: string | null;
  review_period: string | null;
  review_year: number;
  start_date: string | null;
  end_date: string | null;
  unit: string | null;
  progress_type: GoalProgressType;
  subperiod_summary_rule: GoalSummaryRule;
  start_value: number | null;
  target_value: number | null;
  current_value: number | null;
  progress_pct: number | null;
  status: KraStatus;
  status_is_manual: boolean;
  status_reason: string | null;
  notes: string | null;
  child_count: number;
  aligned_count: number;
  mapped_employee_count: number;
  last_updated_at: string | null;
}

export interface KraTreeResult {
  authorized: boolean;
  rows: KraTreeRow[];
  total: number;
  page: number;
  page_size: number;
  parent_id: string | null;
}

export interface KraTreeArgs {
  year: number;
  period: string | null;
  parentId: string | null;
  buIds?: string[];
  deptIds?: string[];
  categoryIds?: string[];
  search?: string;
  page?: number;
  pageSize?: number;
}

const EMPTY_TREE: KraTreeResult = {
  authorized: false, rows: [], total: 0, page: 1, page_size: 100, parent_id: null,
};

/**
 * One level of the KRA tree. `parentId === null` returns the roots.
 * Server-paged — never assume the level fits in one page.
 */
export function useKraTree(args: KraTreeArgs | null) {
  return useQuery<KraTreeResult>({
    queryKey: ['kra-tree', args],
    enabled: !!args,
    staleTime: 60_000,
    queryFn: async () => {
      const a = args!;
      const { data, error } = await supabase.rpc('kra_tree_list' as any, {
        p_year: a.year,
        p_period: a.period,
        p_parent_id: a.parentId,
        p_bu_ids: a.buIds?.length ? a.buIds : null,
        p_dept_ids: a.deptIds?.length ? a.deptIds : null,
        p_category_ids: a.categoryIds?.length ? a.categoryIds : null,
        p_search: a.search?.trim() ? a.search.trim() : null,
        p_page: a.page ?? 1,
        p_page_size: a.pageSize ?? 100,
      });
      if (error) throw error;
      return (data ?? EMPTY_TREE) as unknown as KraTreeResult;
    },
  });
}

/* ------------------------------------------------------------------ *
 * ADR-284 — Review Pipeline
 * ------------------------------------------------------------------ */

export interface BuConsolePipelineStage {
  stage: string;
  kpi_count: number;
  employee_count: number;
}

export interface BuConsolePipelineRow {
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  department_name: string | null;
  pending_stage: string;
  pending_kpis: number;
  total_kpis: number;
  last_activity_at: string | null;
}

export interface BuConsolePipeline {
  authorized: boolean;
  period: string;
  year: number;
  stage: string | null;
  page: number;
  page_size: number;
  total: number;
  employee_total: number;
  stages: BuConsolePipelineStage[];
  rows: BuConsolePipelineRow[];
}

export interface BuConsolePipelineArgs extends BuConsoleScope {
  stage?: string | null;
  page?: number;
  pageSize?: number;
}

const EMPTY_PIPELINE: BuConsolePipeline = {
  authorized: false, period: '', year: 0, stage: null, page: 1, page_size: 50,
  total: 0, employee_total: 0, stages: [], rows: [],
};

/**
 * Stage-level pending counts + a server-paged employee list for the loaded
 * scope. Pending stage is derived from each employee's resolved workflow
 * chain (POLICY §105 — never a hardcoded ladder) applied to
 * `kpis.status` (last COMPLETED stage).
 */
export function useBuConsolePipeline(args: BuConsolePipelineArgs | null) {
  return useQuery<BuConsolePipeline>({
    queryKey: ['bu-console-pipeline', args],
    enabled: !!args,
    staleTime: 60_000,
    queryFn: async () => {
      const a = args!;
      const { data, error } = await supabase.rpc('bu_console_pipeline' as any, {
        p_period: a.period,
        p_year: a.year,
        p_bu_ids: a.buIds?.length ? a.buIds : null,
        p_dept_ids: a.deptIds?.length ? a.deptIds : null,
        p_division_ids: a.divisionIds?.length ? a.divisionIds : null,
        p_manager_ids: a.managerIds?.length ? a.managerIds : null,
        p_stage: a.stage ?? null,
        p_page: a.page ?? 1,
        p_page_size: a.pageSize ?? 50,
      });
      if (error) throw error;
      return (data ?? EMPTY_PIPELINE) as unknown as BuConsolePipeline;
    },
  });
}

/* ------------------------------------------------------------------ */
/* ADR-297 — create one KPI for many people from the console           */
/* ------------------------------------------------------------------ */

/**
 * ADR-319 — the console speaks one scope vocabulary (see `@/lib/review/kpiScope`).
 * `ConsoleKpiKind` stays as a deprecated alias so older callers keep compiling.
 */
export type { KpiScope } from '@/lib/review/kpiScope';
/** @deprecated Use `KpiScope` from `@/lib/review/kpiScope`. */
export type ConsoleKpiKind = 'individual' | 'shared' | 'department_event';

export interface ConsoleKpiCreateArgs {
  kpi: Record<string, unknown> & { scope?: string; kind?: ConsoleKpiKind; kpi_name: string; kra_name: string; category_id: string };
  period: string;
  year: number;
  buIds?: string[];
  deptIds?: string[];
  divisionIds?: string[];
  managerIds?: string[];
  dryRun: boolean;
}

export interface ConsoleKpiCreateResult {
  authorized: boolean;
  reason?: string;
  dry_run?: boolean;
  /** Echoed back by the RPC — the resolved scope. */
  scope?: string;
  kind?: ConsoleKpiKind;
  will_create?: number;
  will_skip?: number;
  preview?: Array<{ employee_id: string; full_name: string; employee_code?: string | null; department_name?: string | null; business_unit_name?: string | null }>;
  skipped?: Array<{ employee_id: string; full_name: string; employee_code?: string | null; reason: string }>;
}

async function callKpiCreate(a: ConsoleKpiCreateArgs): Promise<ConsoleKpiCreateResult> {
  const { data, error } = await supabase.rpc('bu_console_kpi_create' as any, {
    p_kpi: a.kpi,
    p_period: a.period,
    p_year: a.year,
    p_bu_ids: a.buIds?.length ? a.buIds : null,
    p_dept_ids: a.deptIds?.length ? a.deptIds : null,
    p_division_ids: a.divisionIds?.length ? a.divisionIds : null,
    p_manager_ids: a.managerIds?.length ? a.managerIds : null,
    p_dry_run: a.dryRun,
  });
  if (error) throw error;
  return (data ?? { authorized: false }) as unknown as ConsoleKpiCreateResult;
}

/** Preview only — writes nothing. */
export function useConsoleKpiCreatePreview() {
  return useMutation<ConsoleKpiCreateResult, Error, Omit<ConsoleKpiCreateArgs, 'dryRun'>>({
    mutationFn: (a) => callKpiCreate({ ...a, dryRun: true }),
    onError: (e: any) => toast.error(e?.message ?? 'Could not build the creation preview.'),
  });
}

/** Issues the KPI to everyone in scope after the admin confirms the preview. */
export function useConsoleKpiCreate() {
  const qc = useQueryClient();
  return useMutation<ConsoleKpiCreateResult, Error, Omit<ConsoleKpiCreateArgs, 'dryRun'>>({
    mutationFn: (a) => callKpiCreate({ ...a, dryRun: false }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['bu-console-tree'] });
      qc.invalidateQueries({ queryKey: ['bu-console-run-snapshot'] });
      if (!res.authorized) {
        toast.error('Creating KPIs from the console is admin-only.');
        return;
      }
      const n = res.will_create ?? 0;
      toast.success(`KPI issued to ${n} employee${n === 1 ? '' : 's'}` +
        (res.will_skip ? ` · ${res.will_skip} skipped` : ''));
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not create the KPI.'),
  });
}
