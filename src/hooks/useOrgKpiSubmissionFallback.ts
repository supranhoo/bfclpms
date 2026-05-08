import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeKpiKey } from '@/lib/orgKpiKey';

export interface SubmissionFallbackEntry {
  achievedValue: number | null;
  isNa: boolean;
}

/**
 * Fallback read-model for the Org KPI Data Entry table.
 *
 * After a successful Propagate, `review_submissions.achieved_value` and
 * `kpis.status` are updated, but the per-employee `org_kpi_values` row
 * may not exist (legacy / org-scope-only OKV row). Without this hook the
 * scoped table reverts to "—" for every employee even though the Impact
 * sheet — which reads from `review_submissions` — still shows the value.
 *
 * This hook returns a Map keyed `${defKey}||${employeeId}` → { achievedValue, isNa }
 * so the page can fall back to RS values when the OKV row is missing/null.
 *
 * Read-only; uses existing RLS on `kpis` and `review_submissions`.
 */
export function useOrgKpiSubmissionFallback(
  reviewPeriod: string,
  reviewYear: number,
) {
  const { isReady, user } = useAuth();
  return useQuery({
    queryKey: ['org-kpi-submission-fallback', reviewPeriod, reviewYear, user?.id],
    enabled: isReady && !!user && !!reviewPeriod && !!reviewYear,
    queryFn: async () => {
      const map = new Map<string, SubmissionFallbackEntry>();

      // 1) Pull all employee-scope org-level KPI definitions for this period.
      const { data: kpiRows, error: kpiErr } = await supabase
        .from('kpis')
        .select('id, employee_id, category_id, kra_name, kpi_name, org_level_scope, is_org_level')
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .eq('is_org_level', true)
        .eq('org_level_scope', 'employee')
        .not('employee_id', 'is', null);
      if (kpiErr) throw kpiErr;

      const kpiIds = (kpiRows ?? []).map(k => k.id);
      if (kpiIds.length === 0) return map;

      // 2) Pull matching review_submissions in chunks (avoid 1k IN-list cap).
      const submissions: Array<{ kpi_id: string; achieved_value: number | null; is_na: boolean | null }> = [];
      const chunk = 500;
      for (let i = 0; i < kpiIds.length; i += chunk) {
        const slice = kpiIds.slice(i, i + chunk);
        const { data, error } = await supabase
          .from('review_submissions')
          .select('kpi_id, achieved_value, is_na')
          .in('kpi_id', slice);
        if (error) throw error;
        if (data) submissions.push(...data as any);
      }

      const subByKpiId = new Map(submissions.map(s => [s.kpi_id, s]));
      (kpiRows ?? []).forEach(k => {
        const sub = subByKpiId.get(k.id);
        if (!sub) return;
        if (sub.achieved_value === null && !sub.is_na) return;
        const defKey = normalizeKpiKey(k.category_id, k.kra_name, k.kpi_name);
        map.set(`${defKey}||${k.employee_id}`, {
          achievedValue: sub.achieved_value,
          isNa: !!sub.is_na,
        });
      });

      return map;
    },
    staleTime: 30_000,
  });
}