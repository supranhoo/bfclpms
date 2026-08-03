import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { InstanceChangeLogRow } from '@/lib/annualReview/instanceChangeLog';
import type { ExemptionRecord } from '@/lib/annualReview/effectiveEligibility';

export const CHANGE_LOG_PAGE_SIZE = 50;

/**
 * ADR-238 — audited change log for ONE annual review instance.
 *
 * Server-paginated. Access is enforced inside the SECURITY DEFINER function
 * `annual_review_instance_change_log` (admin / hr_pms only) — the `enabled`
 * flag here is a UX guard, never the security boundary.
 */
export function useAnnualReviewInstanceChangeLog(
  instanceId: string | undefined,
  opts: { enabled?: boolean; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? CHANGE_LOG_PAGE_SIZE;
  return useQuery({
    queryKey: ['ar-instance-change-log', instanceId, page, pageSize],
    enabled: !!instanceId && opts.enabled !== false,
    staleTime: 60_000,
    queryFn: async (): Promise<{ rows: InstanceChangeLogRow[]; total: number }> => {
      const { data, error } = await supabase.rpc(
        'annual_review_instance_change_log' as never,
        {
          p_instance_id: instanceId,
          p_limit: pageSize,
          p_offset: (page - 1) * pageSize,
        } as never,
      );
      if (error) throw error;
      const rows = (data ?? []) as unknown as InstanceChangeLogRow[];
      return { rows, total: Number(rows[0]?.total_count ?? 0) };
    },
  });
}

/** Exemption records for a single instance (RLS-scoped by the table policy). */
export function useInstanceEligibilityExemptions(
  instanceId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['ar-instance-exemptions', instanceId],
    enabled: !!instanceId && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ExemptionRecord[]> => {
      const { data, error } = await (supabase as any)
        .from('annual_review_eligibility_exemptions')
        .select('id, instance_id, criterion_id, criterion_name, status, reason, decision_note, decided_at, source, bulk_run_id, penalty_from_percent, penalty_to_percent')
        .eq('instance_id', instanceId);
      if (error) throw error;
      return (data ?? []) as ExemptionRecord[];
    },
  });
}
