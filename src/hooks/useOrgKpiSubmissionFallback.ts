import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeKpiKey } from '@/lib/orgKpiKey';

export interface SubmissionFallbackEntry {
  achievedValue: number | null;
  isNa: boolean;
  /** Self-review remarks (employee-entered). Only populated on per-employee keys. */
  selfRemarks?: string | null;
  /** Self-review evidence URLs (plural preferred, else singular). Empty when none. */
  selfEvidenceUrls?: string[];
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
 * This hook returns a Map with three key shapes:
 *   - `${defKey}||${employeeId}` — per-employee fallback (employee scope)
 *   - `${defKey}||dept||${departmentId}` — aggregated fallback (department scope)
 *   - `${defKey}||org` — aggregated fallback (organization scope)
 *
 * Aggregates are derived as the most common (mode) non-null achieved value
 * across the contributing employee submissions; `isNa` is true only when
 * every contributing submission is NA. This matches what Propagate writes
 * across all employees of a department / organization.
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

      // 1) Pull all org-level KPI definitions for this period (any scope).
      //    The fallback is keyed by canonical definition + employee, then
      //    additionally aggregated for department / organization scope so
      //    every branch of `buildCardData` can resolve a propagated value
      //    when the OKV row is missing or NULL.
      const { data: kpiRows, error: kpiErr } = await supabase
        .from('kpis')
        .select('id, employee_id, category_id, kra_name, kpi_name, org_level_scope, is_org_level, profiles!kpis_employee_id_fkey(department_id)')
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .eq('is_org_level', true)
        .not('employee_id', 'is', null);
      if (kpiErr) throw kpiErr;

      const kpiIds = (kpiRows ?? []).map(k => k.id);
      if (kpiIds.length === 0) return map;

      // 2) Pull matching review_submissions in chunks (avoid 1k IN-list cap).
      const submissions: Array<{
        kpi_id: string;
        achieved_value: number | null;
        is_na: boolean | null;
        self_remarks: string | null;
        self_evidence_url: string | null;
        self_evidence_urls: string[] | null;
      }> = [];
      const chunk = 500;
      for (let i = 0; i < kpiIds.length; i += chunk) {
        const slice = kpiIds.slice(i, i + chunk);
        const { data, error } = await supabase
          .from('review_submissions')
          .select('kpi_id, achieved_value, is_na, self_remarks, self_evidence_url, self_evidence_urls')
          .in('kpi_id', slice);
        if (error) throw error;
        if (data) submissions.push(...data as any);
      }

      const subByKpiId = new Map(submissions.map(s => [s.kpi_id, s]));

      // 3) Per-employee entries (used by the employee-scope branch) +
      //    grouped buckets used to derive department / organization aggregates.
      type Bucket = { values: number[]; naCount: number; total: number };
      const deptBuckets = new Map<string, Bucket>(); // key: `${defKey}||dept||${deptId}`
      const orgBuckets = new Map<string, Bucket>();  // key: `${defKey}||org`

      const pushBucket = (m: Map<string, Bucket>, key: string, val: number | null, isNa: boolean) => {
        let b = m.get(key);
        if (!b) { b = { values: [], naCount: 0, total: 0 }; m.set(key, b); }
        b.total += 1;
        if (isNa) b.naCount += 1;
        else if (val !== null) b.values.push(val);
      };

      (kpiRows ?? []).forEach(k => {
        const sub = subByKpiId.get(k.id);
        if (!sub) return;
        const selfUrls: string[] = Array.isArray(sub.self_evidence_urls) && sub.self_evidence_urls.length > 0
          ? sub.self_evidence_urls.filter((u): u is string => typeof u === 'string' && !!u)
          : (sub.self_evidence_url ? [sub.self_evidence_url] : []);
        const selfRemarks = sub.self_remarks ?? null;
        const hasValue = sub.achieved_value !== null
          || !!sub.is_na
          || !!(selfRemarks && selfRemarks.trim())
          || selfUrls.length > 0;
        if (!hasValue) return;
        const defKey = normalizeKpiKey(k.category_id, k.kra_name, k.kpi_name);

        // Per-employee key (employee scope only — but harmless if dept/org
        // KPIs also expose per-employee keys; the page only reads them on
        // the employee branch).
        if (k.employee_id) {
          map.set(`${defKey}||${k.employee_id}`, {
            achievedValue: sub.achieved_value,
            isNa: !!sub.is_na,
            selfRemarks,
            selfEvidenceUrls: selfUrls,
          });
        }

        const deptId = (k as any).profiles?.department_id as string | null | undefined;
        if (deptId) {
          pushBucket(deptBuckets, `${defKey}||dept||${deptId}`, sub.achieved_value, !!sub.is_na);
        }
        pushBucket(orgBuckets, `${defKey}||org`, sub.achieved_value, !!sub.is_na);
      });

      const resolveBucket = (b: Bucket): SubmissionFallbackEntry => {
        // All-NA wins
        if (b.naCount > 0 && b.naCount === b.total) {
          return { achievedValue: null, isNa: true };
        }
        if (b.values.length === 0) {
          return { achievedValue: null, isNa: false };
        }
        // Mode (most common) — ties broken by first occurrence.
        const counts = new Map<number, number>();
        let bestVal = b.values[0];
        let bestCount = 0;
        for (const v of b.values) {
          const c = (counts.get(v) ?? 0) + 1;
          counts.set(v, c);
          if (c > bestCount) { bestCount = c; bestVal = v; }
        }
        return { achievedValue: bestVal, isNa: false };
      };

      deptBuckets.forEach((b, key) => map.set(key, resolveBucket(b)));
      orgBuckets.forEach((b, key) => map.set(key, resolveBucket(b)));

      return map;
    },
    staleTime: 30_000,
  });
}