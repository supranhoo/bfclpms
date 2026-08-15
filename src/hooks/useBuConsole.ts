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
      });
      if (error) throw error;
      return (data ?? { authorized: false }) as any;
    },
    onSuccess: (res) => {
      if (!res.authorized) { toast.error('Only admins can save goals.'); return; }
      if (res.error) { toast.error(res.error); return; }
      qc.invalidateQueries({ queryKey: ['bu-console-goals'] });
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

