import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Master switch read — used by sidebar gate + route gate. */
export function useBulkReviewFlag() {
  return useQuery({
    queryKey: ['admin_feature_flag', 'feature_bulk_review_dashboard'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('admin_feature_flags' as any)
        .select('value')
        .eq('key', 'feature_bulk_review_dashboard')
        .maybeSingle();
      if (error) return false;
      const raw = (data as any)?.value;
      // value is stored as jsonb; SDK may return boolean or string
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'string') return raw === 'true';
      return false;
    },
  });
}

export interface BulkScopePreview {
  emp_count: number;
  kpi_count: number;
  cell_count: number;
  est_payload_kb: number;
  cap_exceeded: boolean;
}

export interface BulkScopeFilters {
  department_id?: string | null;
  manager_id?: string | null;
  company_id?: string | null;
}

/** Cheap counts. Always safe to call on filter change. */
export function useBulkScopePreview(
  period: string,
  year: number,
  filters: BulkScopeFilters,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['bulk_scope_preview', period, year, filters],
    enabled: enabled && !!period && !!year,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<BulkScopePreview> => {
      const { data, error } = await supabase.rpc('bulk_scope_preview' as any, {
        p_period: period,
        p_year: year,
        p_filters: filters as any,
      });
      if (error) throw error;
      return data as unknown as BulkScopePreview;
    },
  });
}

export interface BulkReviewRow {
  kpi_id: string;
  employee_id: string;
  kpi_name: string;
  kra_name: string;
  weightage: number | null;
  status: string | null;
  kpi_group_type: string;
  frequency: string | null;
  employee_name: string;
  employee_code: string | null;
  submission_id: string | null;
  self_score: number | null;
  manager_score: number | null;
  skip_level_score: number | null;
  hr_pms_score: number | null;
  auditor_score: number | null;
  management_score: number | null;
  final_score: number | null;
  is_na: boolean | null;
  final_revision_no: number | null;
  row_version: number | null;
}

export interface BulkReviewSnapshot {
  rows: BulkReviewRow[];
  total: number;
  page: number;
  page_size: number;
  viewer_stage: string;
}

/**
 * Heavy snapshot. ONLY enable after explicit Load Scope click — caller
 * controls the `enabled` flag so mount/filter changes never hit this RPC.
 */
export function useBulkReviewSnapshot(
  period: string,
  year: number,
  viewerStage: string,
  filters: BulkScopeFilters,
  page: number,
  pageSize: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['bulk_review_snapshot', period, year, viewerStage, filters, page, pageSize],
    enabled: enabled && !!period && !!year && !!viewerStage,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<BulkReviewSnapshot> => {
      const { data, error } = await supabase.rpc('bulk_review_snapshot' as any, {
        p_period: period,
        p_year: year,
        p_viewer_stage: viewerStage,
        p_filters: filters as any,
        p_page: page,
        p_page_size: pageSize,
      });
      if (error) throw error;
      return data as unknown as BulkReviewSnapshot;
    },
  });
}