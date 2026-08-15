/**
 * ADR-269 — data layer for the forward-only KPI text split (FY 2026-27+).
 * All DB access is via admin-gated RPCs; the UI never writes `kpi_name`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { KpiSplitConfidence } from '@/lib/kpiTextSplit';

export interface KpiSplitSummary {
  cutover_fiscal_start_year: number;
  in_scope: number;
  distinct_names: number;
  high: number;
  review: number;
  unparsed: number;
  already_split: number;
  pending: number;
  pending_high: number;
  pending_review?: number;
  pending_unparsed?: number;
  needs_manual?: number;
  needs_manual_groups?: number;
  pending_groups?: number;
  legacy_untouched: number;
}

export type KpiSplitState = 'pending' | 'structured' | 'all';

/** Rows applied per RPC call. The server caps at 20,000; the UI loops until done. */
const APPLY_BATCH_SIZE = 5000;

export interface KpiSplitPreviewRow {
  kpi_id: string;
  review_period: string | null;
  review_year: number | null;
  kra_name: string | null;
  kpi_name: string;
  title: string | null;
  description: string | null;
  formula: string | null;
  scoring_logic: string | null;
  confidence: KpiSplitConfidence;
  already_split: boolean;
  total_count: number;
}

/**
 * ADR-269b1 — duplicate-aware preview. One row per distinct KPI text, so a
 * single correction covers every employee row that shares that text.
 */
export interface KpiSplitGroupRow {
  kpi_name: string;
  sample_kpi_id: string;
  row_count: number;
  pending_count: number;
  structured_count: number;
  kra_sample: string | null;
  title: string | null;
  description: string | null;
  formula: string | null;
  scoring_logic: string | null;
  confidence: KpiSplitConfidence;
  total_groups: number;
}

export function useKpiSplitGroups(params: {
  page: number;
  pageSize: number;
  confidence: KpiSplitConfidence | 'all';
  state?: KpiSplitState;
  enabled?: boolean;
}) {
  const { page, pageSize, confidence, state = 'pending', enabled = true } = params;
  return useQuery({
    queryKey: ['kpi-split-groups', page, pageSize, confidence, state],
    enabled,
    queryFn: async (): Promise<KpiSplitGroupRow[]> => {
      const { data, error } = await supabase.rpc('kpi_split_grouped_dry_run', {
        p_limit: pageSize,
        p_offset: page * pageSize,
        p_confidence: confidence === 'all' ? null : confidence,
        p_state: state,
      });
      if (error) throw error;
      return (data ?? []) as unknown as KpiSplitGroupRow[];
    },
  });
}

export function useKpiSplitSummary(enabled = true) {
  return useQuery({
    queryKey: ['kpi-split-summary'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<KpiSplitSummary> => {
      const { data, error } = await supabase.rpc('kpi_split_summary');
      if (error) throw error;
      return data as unknown as KpiSplitSummary;
    },
  });
}

export function useKpiSplitPreview(params: {
  page: number;
  pageSize: number;
  confidence: KpiSplitConfidence | 'all';
  state?: KpiSplitState;
  enabled?: boolean;
}) {
  const { page, pageSize, confidence, state = 'pending', enabled = true } = params;
  return useQuery({
    queryKey: ['kpi-split-preview', page, pageSize, confidence, state],
    enabled,
    queryFn: async (): Promise<KpiSplitPreviewRow[]> => {
      const { data, error } = await supabase.rpc('kpi_split_dry_run', {
        p_limit: pageSize,
        p_offset: page * pageSize,
        p_confidence: confidence === 'all' ? null : confidence,
        p_state: state,
      });
      if (error) throw error;
      return (data ?? []) as unknown as KpiSplitPreviewRow[];
    },
  });
}

function useInvalidateSplit() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['kpi-split-summary'] });
    qc.invalidateQueries({ queryKey: ['kpi-split-preview'] });
    qc.invalidateQueries({ queryKey: ['kpi-split-groups'] });
  };
}

/**
 * Applies the split in repeated batches until the server reports no pending
 * rows left. No dataset size can silently truncate the run (ADR-269).
 */
export function useApplyKpiSplit(onProgress?: (appliedSoFar: number) => void) {
  const invalidate = useInvalidateSplit();
  return useMutation({
    mutationFn: async (vars: {
      ids?: string[];
      confidence?: KpiSplitConfidence | null;
      batchSize?: number;
    }) => {
      const runIds: string[] = [];
      let applied = 0;

      // Explicit ids => single targeted call (allows manual re-split).
      if (vars.ids?.length) {
        const { data, error } = await supabase.rpc('kpi_split_apply', {
          p_ids: vars.ids,
          p_limit: vars.ids.length,
          p_confidence: vars.confidence ?? null,
        });
        if (error) throw error;
        const res = data as unknown as { run_id: string; applied: number };
        return { run_ids: [res.run_id], run_id: res.run_id, applied: res.applied, batches: 1 };
      }

      for (let batch = 0; batch < 100; batch++) {
        const { data, error } = await supabase.rpc('kpi_split_apply', {
          p_ids: null,
          p_limit: vars.batchSize ?? APPLY_BATCH_SIZE,
          p_confidence: vars.confidence ?? 'high',
        });
        if (error) throw error;
        const res = data as unknown as { run_id: string; applied: number };
        if (!res.applied) break;
        runIds.push(res.run_id);
        applied += res.applied;
        onProgress?.(applied);
        if (res.applied < (vars.batchSize ?? APPLY_BATCH_SIZE)) break;
      }

      return { run_ids: runIds, run_id: runIds[runIds.length - 1] ?? null, applied, batches: runIds.length };
    },
    onSuccess: invalidate,
  });
}

export function useRollbackKpiSplit() {
  const invalidate = useInvalidateSplit();
  return useMutation({
    mutationFn: async (runId: string) => {
      const { data, error } = await supabase.rpc('kpi_split_rollback', { p_run_id: runId });
      if (error) throw error;
      return data as unknown as { run_id: string; reverted: number };
    },
    onSuccess: invalidate,
  });
}

export function useSaveKpiParts() {
  const invalidate = useInvalidateSplit();
  return useMutation({
    mutationFn: async (vars: {
      kpiId: string;
      title: string | null;
      description: string | null;
      formula: string | null;
      scoring_logic: string | null;
    }) => {
      const { data, error } = await supabase.rpc('kpi_split_set_parts', {
        p_kpi_id: vars.kpiId,
        p_title: vars.title,
        p_description: vars.description,
        p_formula: vars.formula,
        p_scoring_logic: vars.scoring_logic,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}
