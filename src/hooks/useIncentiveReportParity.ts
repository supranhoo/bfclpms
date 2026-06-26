import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';

/**
 * Sums employee_incentive_records.incentive_amount for the given program/period,
 * optionally scoped to a company. Returns the report-side total so the data-entry
 * grid can show a parity indicator vs the live Grand Total.
 *
 * RCA 2026-06-19: users mistook the per-page subtotal in ProductionDailyGrid for
 * the program total. The parity badge surfaces the records-table total directly
 * on the grid so the comparison is obvious.
 */
export function useIncentiveReportParity(args: {
  programId: string;
  month: string;
  year: number;
  companyId?: string; // 'all' or undefined = no company filter
  /**
   * @deprecated The RLS-fragile `employeeCompanyMap` from `useCompanyFilter`
   * is no longer consulted. Company membership is resolved via the
   * SECURITY DEFINER RPC `get_incentive_program_employees` (RPC-resolved
   * `company_id`), which is RLS-agnostic for non-admin viewers
   * (Upendra/Sandeep). Argument is accepted for backward compatibility
   * but ignored.
   */
  employeeCompanyMap?: Map<string, string>;
}) {
  const { programId, month, year, companyId } = args;
  const scoped = companyId && companyId !== 'all';

  return useQuery({
    queryKey: ['incentive-report-parity', programId, month, year, scoped ? companyId : 'all'],
    enabled: !!programId && !!month && !!year,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const rows = await fetchAllPaged<{ employee_id: string; incentive_amount: number | string | null }>(
        (from, to) =>
          supabase
            .from('employee_incentive_records')
            .select('employee_id, incentive_amount')
            .eq('program_id', programId)
            .eq('review_period', month)
            .eq('review_year', year)
            .range(from, to),
      );
      let filtered = rows;
      if (scoped) {
        // RLS-safe: resolve company per employee via the program roster RPC
        // (pre-resolves `company_id` server-side).
        const { data: roster, error: rosterErr } = await supabase.rpc(
          'get_incentive_program_employees',
          { _program_id: programId },
        );
        if (rosterErr) throw rosterErr;
        const companyOf = new Map<string, string | null>(
          ((roster ?? []) as any[]).map((r) => [r.id as string, (r.company_id ?? null) as string | null]),
        );
        filtered = rows.filter((r) => companyOf.get(r.employee_id) === companyId);
      }
      const total = filtered.reduce((s, r) => s + Number(r.incentive_amount || 0), 0);
      return { recordsTotal: Math.round(total), hasRecords: filtered.length > 0, count: filtered.length };
    },
  });
}