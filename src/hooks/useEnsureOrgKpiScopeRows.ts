import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * RCA 2026-05-19 — Admin Org KPI Data Entry parity.
 *
 * Lazily materialises one minimal `org_kpi_values` row per mapped employee
 * for the given (category, kra, kpi, period, year) so the card header's
 * Supporting / Parity / Manage-files chips always render. Idempotent on the
 * server; safe to fire on every card mount.
 *
 * When the OKV row is newly created (or pre-existing with no evidence yet)
 * the RPC also copies `review_submissions.self_evidence_urls` into the row's
 * `evidence_urls` field, so admin sees the same supporting files the
 * employee uploaded. Never overwrites admin-entered values, remarks, or
 * non-empty evidence.
 */
export interface EnsureScopeRowsParams {
  categoryId: string;
  kraName: string;
  kpiName: string;
  reviewPeriod: string;
  reviewYear: number;
}

export interface EnsureScopeRowsResult {
  created: number;
  evidence_seeded: number;
  already_existed: number;
}

export function useEnsureOrgKpiScopeRows() {
  const queryClient = useQueryClient();

  return useMutation<EnsureScopeRowsResult, Error, EnsureScopeRowsParams>({
    mutationFn: async (params) => {
      const { data, error } = await supabase.rpc('ensure_org_kpi_scope_rows', {
        p_category_id: params.categoryId,
        p_kra_name: params.kraName,
        p_kpi_name: params.kpiName,
        p_review_period: params.reviewPeriod,
        p_review_year: params.reviewYear,
      });
      if (error) throw error;
      return (data ?? { created: 0, evidence_seeded: 0, already_existed: 0 }) as unknown as EnsureScopeRowsResult;
    },
    onSuccess: (result) => {
      // Only invalidate when we actually changed something — saves a refetch storm.
      if (result.created > 0 || result.evidence_seeded > 0) {
        queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
        queryClient.invalidateQueries({ queryKey: ['org-kpi-evidence-files'] });
        queryClient.invalidateQueries({ queryKey: ['org-kpi-evidence-counts'] });
        queryClient.invalidateQueries({ queryKey: ['org-kpi-evidence-parity'] });
        queryClient.invalidateQueries({ queryKey: ['org-kpi-submission-fallback'] });
      }
    },
  });
}
