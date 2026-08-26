/**
 * ADR-324 — data layer for KPI scoring ladders.
 *
 * Reads and writes go through SECURITY DEFINER RPCs only
 * (POLICY §CONSOLE-WRITE-TIERS); the client never touches `kpis` directly.
 * Apply is always previewed first — the same call with `p_dry_run`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { BuConsoleScope } from '@/hooks/useBuConsole';
import {
  DEFAULT_LADDER_CONFIG,
  type LadderConfig,
  type LadderTier,
} from '@/components/admin/bu-console/scoringLadderModel';

export interface LadderTarget {
  categoryId: string | null;
  kraName: string;
  kpiName: string;
}

export interface LadderPayload {
  authorized: boolean;
  kpi_key?: string;
  config: LadderConfig;
  tiers: LadderTier[];
}

export interface LadderApplyRow {
  kpi_id: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  department_name?: string | null;
  designation?: string | null;
  level?: string | null;
  is_manager?: boolean;
  tier_label?: string | null;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  reason?: string;
}

export interface LadderTierStat {
  tier_id: string;
  tier_label: string;
  match_dimension: string;
  match_value: string | null;
  tier_target: number | null;
  headcount: number;
}

export interface LadderApplyResult {
  authorized: boolean;
  dry_run: boolean;
  run_id: string | null;
  cascade_mode?: string;
  rollup_mode?: string;
  parent_target?: number | null;
  will_apply?: number;
  will_skip?: number;
  applied?: number;
  skipped?: number;
  tiers?: LadderTierStat[];
  preview?: LadderApplyRow[];
  skipped_details?: LadderApplyRow[];
}

export interface LadderApplyArgs extends BuConsoleScope, LadderTarget {
  resetOverrides: boolean;
  dryRun: boolean;
}

export function useKpiLadder(target: LadderTarget | null, period: string, year: number) {
  return useQuery({
    queryKey: ['bu-console-ladder', target?.categoryId, target?.kraName, target?.kpiName, period, year],
    enabled: !!target,
    staleTime: 60_000,
    queryFn: async (): Promise<LadderPayload> => {
      const { data, error } = await supabase.rpc('bu_console_ladder_get' as any, {
        p_category_id: target!.categoryId,
        p_kra_name: target!.kraName,
        p_kpi_name: target!.kpiName,
        p_period: period,
        p_year: year,
      });
      if (error) throw error;
      const d = (data ?? {}) as any;
      return {
        authorized: !!d.authorized,
        kpi_key: d.kpi_key,
        config: { ...DEFAULT_LADDER_CONFIG, ...(d.config ?? {}) } as LadderConfig,
        tiers: (d.tiers ?? []) as LadderTier[],
      };
    },
  });
}

export function useSaveKpiLadder() {
  const qc = useQueryClient();
  return useMutation<
    LadderPayload,
    Error,
    LadderTarget & { period: string; year: number; config: LadderConfig; tiers: LadderTier[] }
  >({
    mutationFn: async (a) => {
      const { data, error } = await supabase.rpc('bu_console_ladder_upsert' as any, {
        p_category_id: a.categoryId,
        p_kra_name: a.kraName,
        p_kpi_name: a.kpiName,
        p_period: a.period,
        p_year: a.year,
        p_config: a.config as any,
        p_tiers: a.tiers as any,
      });
      if (error) throw error;
      return (data ?? { authorized: false, config: DEFAULT_LADDER_CONFIG, tiers: [] }) as unknown as LadderPayload;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bu-console-ladder'] });
      toast.success('Scoring ladder saved.');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not save the scoring ladder.'),
  });
}

async function callLadderApply(a: LadderApplyArgs): Promise<LadderApplyResult> {
  const { data, error } = await supabase.rpc('bu_console_ladder_apply' as any, {
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
  return (data ?? { authorized: false, dry_run: a.dryRun, run_id: null }) as unknown as LadderApplyResult;
}

export function useLadderPreview() {
  return useMutation<LadderApplyResult, Error, Omit<LadderApplyArgs, 'dryRun'>>({
    mutationFn: (a) => callLadderApply({ ...a, dryRun: true }),
    onError: (e: any) => toast.error(e?.message ?? 'Could not build the ladder preview.'),
  });
}

export function useLadderCommit() {
  const qc = useQueryClient();
  return useMutation<LadderApplyResult, Error, Omit<LadderApplyArgs, 'dryRun'>>({
    mutationFn: (a) => callLadderApply({ ...a, dryRun: false }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['bu-console-run'] });
      qc.invalidateQueries({ queryKey: ['bu-console-kpi-detail'] });
      qc.invalidateQueries({ queryKey: ['bu-console-tree'] });
      const n = res.applied ?? 0;
      toast.success(
        `Ladder applied to ${n} employee${n === 1 ? '' : 's'}` + (res.skipped ? ` · ${res.skipped} skipped` : ''),
      );
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not apply the scoring ladder.'),
  });
}
