/**
 * ADR-286 — Performance Console "Review Run".
 *
 * Data layer for running a whole review from the console instead of opening
 * one employee at a time on the dashboard:
 *  - `useRunSnapshot`    → KPI x employee worksheet for a scope + stage
 *  - `useRunAdvance*`    → preview / commit a stage move for a selected set
 *  - `useEmployeeScorecard` → one person's full period, for the column drawer
 *  - target-rule hooks   → tiered targets for a shared KPI (ADR-288)
 *
 * All reads and writes go through SECURITY DEFINER RPCs; the client never
 * touches `kpis` or `review_submissions` directly (POLICY §CONSOLE-WRITE-TIERS).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { BuConsoleScope } from '@/hooks/useBuConsole';

/* ------------------------------------------------------------------ */
/* Snapshot                                                            */
/* ------------------------------------------------------------------ */

export interface RunEmployee {
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  department_name: string | null;
  business_unit_name: string | null;
}

export interface RunKpi {
  kpi_key: string;
  category_id: string | null;
  category_name: string;
  kra_name: string;
  kpi_name: string;
  uom: string | null;
  employee_count: number;
  target_variants: number;
  sample_target: string | null;
}

export interface RunCell {
  kpi_key: string;
  kpi_id: string;
  employee_id: string;
  status: string | null;
  weightage: number | null;
  target_value: string | null;
  is_na: boolean;
  final_score: number | null;
  achieved_value: number | null;
  stage_score: number | null;
  actionable: boolean;
}

export interface RunSnapshot {
  authorized: boolean;
  stage: string;
  employee_total: number;
  kpi_total: number;
  page: number;
  page_size: number;
  capped: boolean;
  can_write?: boolean;
  employees: RunEmployee[];
  kpis: RunKpi[];
  cells: RunCell[];
}

export interface RunSnapshotArgs extends BuConsoleScope {
  stage: string;
  categoryId?: string | null;
  kraName?: string | null;
  page: number;
  pageSize: number;
}

export function useRunSnapshot(args: RunSnapshotArgs | null) {
  return useQuery({
    queryKey: ['bu-console-run', args],
    enabled: !!args,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async (): Promise<RunSnapshot> => {
      const { data, error } = await supabase.rpc('bu_console_run_snapshot' as any, {
        p_period: args!.period,
        p_year: args!.year,
        p_stage: args!.stage,
        p_category_id: args!.categoryId ?? null,
        p_kra_name: args!.kraName ?? null,
        p_bu_ids: args!.buIds.length ? args!.buIds : null,
        p_dept_ids: args!.deptIds.length ? args!.deptIds : null,
        p_division_ids: args!.divisionIds?.length ? args!.divisionIds : null,
        p_manager_ids: args!.managerIds?.length ? args!.managerIds : null,
        p_page: args!.page,
        p_page_size: args!.pageSize,
      });
      if (error) throw error;
      const d = (data ?? {}) as any;
      return {
        authorized: !!d.authorized,
        stage: d.stage ?? args!.stage,
        employee_total: d.employee_total ?? 0,
        kpi_total: d.kpi_total ?? 0,
        page: d.page ?? 0,
        page_size: d.page_size ?? args!.pageSize,
        capped: !!d.capped,
        can_write: !!d.can_write,
        employees: d.employees ?? [],
        kpis: d.kpis ?? [],
        cells: d.cells ?? [],
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Selection advance                                                   */
/* ------------------------------------------------------------------ */

export const RUN_SKIP_LABELS: Record<string, string> = {
  final_score_locked: 'Final score approved — immutable (POLICY §88)',
  final_approval_not_supported: 'Next stage is final approval — not allowed from the console',
  stage_mismatch: 'Not waiting at this stage right now',
  stage_not_in_workflow: 'This stage is not part of the employee’s workflow',
  status_not_in_workflow: 'Current status is not part of the resolved workflow',
  terminal_stage: 'Already at the last stage of the workflow',
  no_workflow: 'No workflow resolved for this employee',
  no_submission: 'No submission row yet — enter a value first',
  not_scored: 'No score to carry forward',
  kra_set_admin_only: 'Still in KRA Set — admins only',
};

export interface RunAdvanceRow {
  kpi_id: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  kra_name: string | null;
  kpi_name: string | null;
  current_status: string | null;
  next_status?: string | null;
  carry_forward_score?: number | null;
  reason?: string;
}

export interface RunAdvanceResult {
  authorized: boolean;
  dry_run: boolean;
  batch_id: string | null;
  target_stage?: string;
  will_advance?: number;
  will_skip?: number;
  advanced?: number;
  skipped?: number;
  skip_summary?: { reason: string; count: number }[];
  preview?: RunAdvanceRow[];
  skipped_details?: RunAdvanceRow[];
}

export interface RunAdvanceArgs {
  kpiIds: string[];
  targetStage: string;
  remarks: string | null;
  dryRun: boolean;
}

async function callRunAdvance(a: RunAdvanceArgs): Promise<RunAdvanceResult> {
  const { data, error } = await supabase.rpc('bu_console_kpi_advance' as any, {
    p_kpi_ids: a.kpiIds,
    p_target_stage: a.targetStage,
    p_remarks: a.remarks,
    p_dry_run: a.dryRun,
  });
  if (error) throw error;
  return (data ?? { authorized: false, dry_run: a.dryRun, batch_id: null }) as unknown as RunAdvanceResult;
}

export function useRunAdvancePreview() {
  return useMutation<RunAdvanceResult, Error, Omit<RunAdvanceArgs, 'dryRun'>>({
    mutationFn: (a) => callRunAdvance({ ...a, dryRun: true }),
    onError: (e: any) => toast.error(e?.message ?? 'Could not build the preview.'),
  });
}

export function useRunAdvanceCommit() {
  const qc = useQueryClient();
  return useMutation<RunAdvanceResult, Error, Omit<RunAdvanceArgs, 'dryRun'>>({
    mutationFn: (a) => callRunAdvance({ ...a, dryRun: false }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['bu-console-run'] });
      qc.invalidateQueries({ queryKey: ['bu-console-employee-scorecard'] });
      qc.invalidateQueries({ queryKey: ['bu-console-tree'] });
      qc.invalidateQueries({ queryKey: ['bu-console-pipeline'] });
      const moved = res.advanced ?? 0;
      const skipped = res.skipped ?? 0;
      toast.success(
        `${moved} row${moved === 1 ? '' : 's'} moved forward` + (skipped ? ` · ${skipped} skipped` : ''),
        { description: res.batch_id ? `Batch ${res.batch_id.slice(0, 8)}` : undefined },
      );
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not move the selection forward.'),
  });
}

/* ------------------------------------------------------------------ */
/* Employee scorecard drawer                                           */
/* ------------------------------------------------------------------ */

export interface EmployeeScorecardRow {
  kpi_id: string;
  category_name: string;
  kra_name: string;
  kpi_name: string;
  weightage: number | null;
  target_value: string | null;
  uom: string | null;
  status: string | null;
  is_na: boolean;
  achieved_value: number | null;
  self_score: number | null;
  manager_score: number | null;
  functional_manager_score: number | null;
  skip_level_score: number | null;
  hr_pms_score: number | null;
  auditor_score: number | null;
  management_score: number | null;
  final_score: number | null;
  actionable: boolean;
}

export interface EmployeeScorecard {
  authorized: boolean;
  can_write?: boolean;
  employee: (RunEmployee & { designation?: string | null }) | null;
  workflow: string[] | null;
  rows: EmployeeScorecardRow[];
}

export function useEmployeeScorecard(
  employeeId: string | null,
  period: string | null,
  year: number | null,
) {
  return useQuery({
    queryKey: ['bu-console-employee-scorecard', employeeId, period, year],
    enabled: !!employeeId && !!period && !!year,
    staleTime: 60_000,
    queryFn: async (): Promise<EmployeeScorecard> => {
      const { data, error } = await supabase.rpc('bu_console_employee_scorecard' as any, {
        p_employee_id: employeeId,
        p_period: period,
        p_year: year,
      });
      if (error) throw error;
      const d = (data ?? {}) as any;
      return {
        authorized: !!d.authorized,
        can_write: !!d.can_write,
        employee: d.employee ?? null,
        workflow: Array.isArray(d.workflow) ? d.workflow : null,
        rows: d.rows ?? [],
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/* ADR-288 — tiered target rules                                       */
/* ------------------------------------------------------------------ */

export type TargetMatchDimension = 'default' | 'level' | 'designation' | 'department' | 'is_manager';

export interface TargetRule {
  id: string;
  category_id: string | null;
  kra_name: string;
  kpi_key: string;
  kpi_name: string;
  review_period: string | null;
  review_year: number | null;
  match_dimension: TargetMatchDimension;
  match_value: string | null;
  target_value: string;
  priority: number;
  notes: string | null;
}

/** Mirrors the server key used by `bu_console_target_rules_apply`. */
export function targetRuleKey(categoryId: string | null, kraName: string, kpiName: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${categoryId ?? '-'}|${norm(kraName)}|${norm(kpiName)}`;
}

export function useTargetRules(kpiKey: string | null) {
  return useQuery({
    queryKey: ['bu-console-target-rules', kpiKey],
    enabled: !!kpiKey,
    staleTime: 60_000,
    queryFn: async (): Promise<TargetRule[]> => {
      const { data, error } = await supabase
        .from('bu_console_target_rules' as any)
        .select('*')
        .eq('kpi_key', kpiKey!)
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TargetRule[];
    },
  });
}

export function useSaveTargetRule() {
  const qc = useQueryClient();
  return useMutation<void, Error, Partial<TargetRule> & { kpi_key: string; kra_name: string; kpi_name: string; target_value: string; match_dimension: TargetMatchDimension }>({
    mutationFn: async (rule) => {
      const { error } = await supabase
        .from('bu_console_target_rules' as any)
        .upsert(rule as any, { onConflict: 'kpi_key,match_dimension,match_value,review_period,review_year' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bu-console-target-rules'] });
      toast.success('Target rule saved.');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not save the rule.'),
  });
}

export function useDeleteTargetRule() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('bu_console_target_rules' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bu-console-target-rules'] });
      toast.success('Target rule removed.');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not remove the rule.'),
  });
}

export const TARGET_APPLY_SKIP_LABELS: Record<string, string> = {
  no_matching_rule: 'No rule matches this employee',
  final_score_locked: 'Final score approved — immutable (POLICY §88)',
  manual_override: 'Target tuned by hand — left alone',
  already_matches: 'Already on the rule’s target',
};

export interface TargetApplyRow {
  kpi_id: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  department_name?: string | null;
  designation?: string | null;
  level?: string | null;
  is_manager?: boolean;
  current_target?: string | null;
  new_target?: string | null;
  reason?: string;
}

export interface TargetApplyResult {
  authorized: boolean;
  dry_run: boolean;
  run_id: string | null;
  will_apply?: number;
  will_skip?: number;
  applied?: number;
  skipped?: number;
  preview?: TargetApplyRow[];
  skipped_details?: TargetApplyRow[];
}

export interface TargetApplyArgs extends BuConsoleScope {
  categoryId: string | null;
  kraName: string;
  kpiName: string;
  resetOverrides: boolean;
  dryRun: boolean;
}

async function callTargetApply(a: TargetApplyArgs): Promise<TargetApplyResult> {
  const { data, error } = await supabase.rpc('bu_console_target_rules_apply' as any, {
    p_category_id: a.categoryId,
    p_kra_name: a.kraName,
    p_kpi_name: a.kpiName,
    p_period: a.period,
    p_year: a.year,
    p_bu_ids: a.buIds.length ? a.buIds : null,
    p_dept_ids: a.deptIds.length ? a.deptIds : null,
    p_division_ids: a.divisionIds?.length ? a.divisionIds : null,
    p_manager_ids: a.managerIds?.length ? a.managerIds : null,
    p_reset_overrides: a.resetOverrides,
    p_dry_run: a.dryRun,
  });
  if (error) throw error;
  return (data ?? { authorized: false, dry_run: a.dryRun, run_id: null }) as unknown as TargetApplyResult;
}

export function useTargetRulesPreview() {
  return useMutation<TargetApplyResult, Error, Omit<TargetApplyArgs, 'dryRun'>>({
    mutationFn: (a) => callTargetApply({ ...a, dryRun: true }),
    onError: (e: any) => toast.error(e?.message ?? 'Could not build the preview.'),
  });
}

export function useTargetRulesCommit() {
  const qc = useQueryClient();
  return useMutation<TargetApplyResult, Error, Omit<TargetApplyArgs, 'dryRun'>>({
    mutationFn: (a) => callTargetApply({ ...a, dryRun: false }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['bu-console-run'] });
      qc.invalidateQueries({ queryKey: ['bu-console-kpi-detail'] });
      qc.invalidateQueries({ queryKey: ['bu-console-tree'] });
      const n = res.applied ?? 0;
      toast.success(`Target applied to ${n} employee${n === 1 ? '' : 's'}` +
        (res.skipped ? ` · ${res.skipped} skipped` : ''));
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not apply the target rules.'),
  });
}
