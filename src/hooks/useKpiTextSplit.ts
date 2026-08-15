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
  legacy_untouched: number;
}

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
  enabled?: boolean;
}) {
  const { page, pageSize, confidence, enabled = true } = params;
  return useQuery({
    queryKey: ['kpi-split-preview', page, pageSize, confidence],
    enabled,
    queryFn: async (): Promise<KpiSplitPreviewRow[]> => {
      const { data, error } = await supabase.rpc('kpi_split_dry_run', {
        p_limit: pageSize,
        p_offset: page * pageSize,
        p_confidence: confidence === 'all' ? null : confidence,
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
  };
}

export function useApplyKpiSplit() {
  const invalidate = useInvalidateSplit();
  return useMutation({
    mutationFn: async (vars: { ids?: string[]; limit?: number; confidence?: KpiSplitConfidence | null }) => {
      const { data, error } = await supabase.rpc('kpi_split_apply', {
        p_ids: vars.ids ?? null,
        p_limit: vars.limit ?? 1000,
        p_confidence: vars.confidence ?? 'high',
      });
      if (error) throw error;
      return data as unknown as { run_id: string; applied: number };
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
