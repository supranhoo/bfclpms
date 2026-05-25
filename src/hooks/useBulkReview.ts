import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { batchOrgKpiIds } from '@/lib/orgKpiGap';

/**
 * Profile attributes (designation / pms_grade / reporting manager) for the
 * employees currently present in the loaded Bulk Review snapshot. Used by
 * the dashboard's Designation / Grade / Reporting Manager filters.
 *
 * Read-only `profiles` select; RLS-bounded to whatever the viewer can already
 * see. We dedupe + sort the input id list so the query key is stable across
 * snapshot re-orderings.
 */
export interface BulkEmployeeAttr {
  id: string;
  designation: string | null;
  pms_grade: string | null;
  reporting_manager_id: string | null;
  reporting_manager_name: string | null;
}

export function useBulkEmployeeAttrs(employeeIds: string[], enabled: boolean) {
  const sorted = [...new Set(employeeIds)].sort();
  return useQuery({
    queryKey: ['bulk_employee_attrs', sorted],
    enabled: enabled && sorted.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<BulkEmployeeAttr[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, designation, pms_grade, reporting_manager_id, reporting_manager:profiles!profiles_reporting_manager_id_fkey(full_name)')
        .in('id', sorted);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        designation: r.designation ?? null,
        pms_grade: r.pms_grade ?? null,
        reporting_manager_id: r.reporting_manager_id ?? null,
        reporting_manager_name: r.reporting_manager?.full_name ?? null,
      }));
    },
  });
}

/**
 * Org-KPI flags for a batch of KPI ids loaded into the Bulk Review snapshot.
 * Uses the read-only SECURITY DEFINER RPC `rpc_kpi_org_flags` so non-admin
 * viewers (manager/skip/hr_pms/auditor/management) can still tell which
 * KPIs are Org-level — direct SELECT on `kpis` is RLS-blocked for them
 * (same root cause as the v2.66.12.10 KRA-dropdown fix).
 */
export interface KpiOrgFlag {
  kpi_id: string;
  is_org_level: boolean;
  org_level_scope: string | null;
}

export function useBulkOrgKpiFlags(kpiIds: string[], enabled: boolean) {
  const sorted = [...new Set(kpiIds)].sort();
  return useQuery({
    queryKey: ['rpc_kpi_org_flags', sorted],
    enabled: enabled && sorted.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<KpiOrgFlag[]> => {
      const chunks = batchOrgKpiIds(sorted);
      const results = await Promise.all(chunks.map(async (chunk) => {
        const { data, error } = await supabase.rpc(
          'rpc_kpi_org_flags' as any,
          { p_kpi_ids: chunk },
        );
        if (error) throw error;
        return (data as unknown as KpiOrgFlag[]) ?? [];
      }));
      return results.flat();
    },
  });
}

/** Master switch read — used by sidebar gate + route gate. */
export function useBulkReviewFlag() {
  return useQuery({
    queryKey: ['admin_feature_flag', 'feature_bulk_review_dashboard'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      // Evaluates master switch + target_roles + target_user_ids server-side
      // (admins always bypass once the master switch is ON).
      const { data, error } = await supabase.rpc(
        'is_feature_flag_enabled_for_me' as any,
        { p_key: 'feature_bulk_review_dashboard' },
      );
      if (error) return false;
      return data === true;
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
  division_id?: string | null;
  business_unit_id?: string | null;
  category_id?: string | null;
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

/**
 * Accumulated snapshot — loops `bulk_review_snapshot` pages until all rows
 * for the scope are loaded. Used by matrix mode so every mapped employee is
 * reachable via horizontal scroll / employee-window pager. Capped by
 * `bulk_scope_preview.cell_count` (already ≤ 25k by §0 governance) so this
 * cannot run away. Page size pinned to RPC max (500).
 */
const ACCUMULATE_PAGE_SIZE = 500;
const ACCUMULATE_MAX_PAGES = 60; // hard safety: 60 × 500 = 30k cells

export function useBulkReviewSnapshotAll(
  period: string,
  year: number,
  viewerStage: string,
  filters: BulkScopeFilters,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['bulk_review_snapshot_all', period, year, viewerStage, filters],
    enabled: enabled && !!period && !!year && !!viewerStage,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<BulkReviewSnapshot> => {
      const merged: BulkReviewRow[] = [];
      let total = 0;
      let pageIdx = 1;
      let lastViewerStage = viewerStage;
      while (pageIdx <= ACCUMULATE_MAX_PAGES) {
        const { data, error } = await supabase.rpc('bulk_review_snapshot' as any, {
          p_period: period,
          p_year: year,
          p_viewer_stage: viewerStage,
          p_filters: filters as any,
          p_page: pageIdx,
          p_page_size: ACCUMULATE_PAGE_SIZE,
        });
        if (error) throw error;
        const snap = data as unknown as BulkReviewSnapshot;
        const rows = snap?.rows ?? [];
        total = snap?.total ?? merged.length + rows.length;
        lastViewerStage = snap?.viewer_stage ?? viewerStage;
        merged.push(...rows);
        if (rows.length < ACCUMULATE_PAGE_SIZE) break;
        if (merged.length >= total) break;
        pageIdx += 1;
      }
      return {
        rows: merged,
        total,
        page: 1,
        page_size: merged.length,
        viewer_stage: lastViewerStage,
      };
    },
  });
}

// ============= M3: Cell detail =============
/**
 * Rich per-cell detail used by the BulkCellDrawer to render the same
 * KpiReviewPanel as "View KPI Details" — KPI header, rating-scale-derived
 * rating, evidence, history, queries, workflow stages, org-KPI source.
 *
 * Per-click only (no grid pre-fetch — preserves ADR-064 lean-load).
 */
export interface KpiCellDetail {
  kpi: any;
  submission: any | null;
  revisions: any[];
  employee: {
    id: string;
    full_name: string | null;
    employee_code: string | null;
    designation: string | null;
    department_id: string | null;
    reporting_manager_id: string | null;
    reporting_manager_name: string | null;
  } | null;
  kpi_history: { kpis: any[]; submissions: any[] };
  queries: any[];
  workflow: any | null;
  org_kpi: any | null;
}

export function useKpiCellDetail(kpiId: string | null, empId: string | null, enabled: boolean) {
  return useQuery<KpiCellDetail>({
    queryKey: ['kpi_cell_detail', kpiId, empId],
    enabled: enabled && !!kpiId && !!empId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('kpi_cell_detail' as any, {
        p_kpi_id: kpiId, p_emp_id: empId,
      });
      if (error) throw error;
      return data as unknown as KpiCellDetail;
    },
  });
}

// ============= M4: Write RPCs =============
export interface BulkWriteCell {
  submission_id: string;
  score?: number | null;
  remarks?: string | null;
  expected_row_version?: number | null;
}

export interface BulkWriteResult {
  batch_id: string;
  applied: number;
  skipped: Array<{ submission_id: string; reason: string }>;
}

export function useBulkWriteStageScores() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      stage: 'manager' | 'skip_level' | 'hr_pms' | 'auditor';
      cells: BulkWriteCell[];
      reason?: string;
      attachment_urls?: string[];
      /** submission_id → reviewer-entered achievement (writes review_submissions.achieved_value too). */
      achieved_values?: Record<string, number | string | null>;
      /** submission_id → reviewer-entered manual rating 0-5. */
      manual_scores?: Record<string, number>;
      /** Admin Override toggle — stamps `inherited_from = 'admin_override'`. */
      is_override?: boolean;
    }): Promise<BulkWriteResult> => {
      const { data, error } = await supabase.rpc('bulk_write_stage_scores' as any, {
        p_stage: args.stage,
        p_cells: args.cells as any,
        p_batch_reason: args.reason ?? null,
        p_attachment_urls: (args.attachment_urls ?? []) as any,
        p_manual_scores: (args.manual_scores ?? null) as any,
        p_achieved_values: (args.achieved_values ?? null) as any,
        p_is_override: args.is_override ?? false,
      });
      if (error) throw error;
      return data as unknown as BulkWriteResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bulk_review_snapshot'] });
      qc.invalidateQueries({ queryKey: ['bulk_review_snapshot_all'] });
      qc.invalidateQueries({ queryKey: ['bulk_scope_preview'] });
      qc.invalidateQueries({ queryKey: ['kpi_cell_detail'] });
    },
  });
}

export function useBulkManagementApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      cells: Array<{ submission_id: string; expected_row_version?: number | null }>;
      reason?: string;
      attachment_urls?: string[];
    }): Promise<BulkWriteResult> => {
      const { data, error } = await supabase.rpc('bulk_management_approve' as any, {
        p_cells: args.cells as any,
        p_batch_reason: args.reason ?? null,
        p_attachment_urls: (args.attachment_urls ?? []) as any,
      });
      if (error) throw error;
      return data as unknown as BulkWriteResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bulk_review_snapshot'] });
      qc.invalidateQueries({ queryKey: ['kpi_cell_detail'] });
      qc.invalidateQueries({ queryKey: ['bulk_scope_preview'] });
    },
  });
}

// ============= M5: Re-open =============
export function useBulkReopenCells() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      cells: Array<{ submission_id: string }>;
      stages_to_unlock: Array<'manager' | 'skip_level' | 'hr_pms' | 'auditor'>;
      reason: string;
    }): Promise<BulkWriteResult> => {
      const { data, error } = await supabase.rpc('bulk_reopen_cells' as any, {
        p_cells: args.cells as any,
        p_stages_to_unlock: args.stages_to_unlock as any,
        p_reason: args.reason,
      });
      if (error) throw error;
      return data as unknown as BulkWriteResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bulk_review_snapshot'] });
      qc.invalidateQueries({ queryKey: ['kpi_cell_detail'] });
    },
  });
}