/**
 * useOrgKpiPeriodCounts
 * ---------------------
 * Lightweight aggregate of org_kpi_values for the selected period, used by
 * the Team Reviews "Org KPIs" tile. Returns one number per status, plus
 * total. Cached for 60 s and gated by `enabled` so it never fires for
 * managers who don't see the Org KPI tile.
 *
 * Performance: single SELECT of one column, ~hundreds of rows per period.
 * No joins, no head-count round-trips, ~sub-200ms warm.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';

export interface OrgKpiPeriodCounts {
  pending: number;
  entered: number;
  propagated: number;
  total: number;
}

export function useOrgKpiPeriodCounts(
  reviewPeriod: string | null | undefined,
  reviewYear: number | null | undefined,
  enabled: boolean,
) {
  return useQuery<OrgKpiPeriodCounts>({
    queryKey: ['orgKpiPeriodCounts', reviewPeriod, reviewYear],
    enabled: !!reviewPeriod && !!reviewYear && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const rows = await fetchAllPaged<{ status: string | null }>((from, to) =>
        supabase
          .from('org_kpi_values')
          .select('status')
          .eq('review_period', reviewPeriod!)
          .eq('review_year', reviewYear!)
          .order('id')
          .range(from, to),
      );
      let pending = 0, entered = 0, propagated = 0;
      for (const r of rows) {
        if (r.status === 'pending') pending++;
        else if (r.status === 'entered') entered++;
        else if (r.status === 'propagated') propagated++;
      }
      return { pending, entered, propagated, total: rows.length };
    },
  });
}
