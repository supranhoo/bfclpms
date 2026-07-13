import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfilesVersion } from '@/hooks/useProfilesVersion';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface MonthKey {
  month: string;
  year: number;
  label: string;
  key: string;
}

export interface TrendEmployee {
  id: string;
  fullName: string;
  employeeCode: string;
  designation: string;
  departmentName: string;
  businessUnitId: string | null;
  businessUnitName: string;
  reportingManagerName: string | null;
  isActive: boolean;
  monthlyScores: Record<string, number | null>;
  /** Per-month Final-Score-only value (null when no final_score present). */
  monthlyFinalScores: Record<string, number | null>;
  avg: number | null;
  /** Simple average of monthlyFinalScores (Final Score only). Used for PIP. */
  finalOnlyAvg: number | null;
  trend: 'up' | 'down' | 'flat' | 'na';
}

export interface MonthlyTrendFilters {
  fromMonth: string;
  fromYear: number;
  toMonth: string;
  toYear: number;
  search?: string;
  includeInactive?: boolean;
  /** Only fetch when explicitly enabled (load button click) */
  enabled?: boolean;
}

export interface MonthlyTrendResult {
  months: MonthKey[];
  employees: TrendEmployee[];
  capped: boolean;
}

const MAX_RANGE = 12;

export function buildMonthRange(
  fromMonth: string,
  fromYear: number,
  toMonth: string,
  toYear: number,
): MonthKey[] {
  const fromIdx = MONTHS.indexOf(fromMonth);
  const toIdx = MONTHS.indexOf(toMonth);
  if (fromIdx === -1 || toIdx === -1) return [];
  // Compute total months between; bail if negative
  const total = (toYear - fromYear) * 12 + (toIdx - fromIdx);
  if (total < 0) return [];

  const out: MonthKey[] = [];
  let y = fromYear;
  let m = fromIdx;
  for (let i = 0; i <= total && i < 24; i++) {
    out.push({
      month: MONTHS[m],
      year: y,
      label: `${MONTHS[m].slice(0, 3)} ${y}`,
      key: `${MONTHS[m]}-${y}`,
    });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

export function useMonthlyTrend(filters: MonthlyTrendFilters) {
  const profilesVersion = useProfilesVersion();
  return useQuery({
    queryKey: [
      'monthly-trend',
      filters.fromMonth, filters.fromYear,
      filters.toMonth, filters.toYear,
      filters.includeInactive ?? false,
      profilesVersion,
    ],
    queryFn: async (): Promise<MonthlyTrendResult> => {
      const fullRange = buildMonthRange(
        filters.fromMonth, filters.fromYear,
        filters.toMonth, filters.toYear,
      );
      const capped = fullRange.length > MAX_RANGE;
      const months = capped ? fullRange.slice(-MAX_RANGE) : fullRange;
      if (months.length === 0) {
        return { months: [], employees: [], capped: false };
      }

      // Single server-side aggregation call. Replaces the previous multi-batch
      // client fetch that timed out on 6-month ranges (13k+ KPIs → 88+ REST
      // round trips). See POLICY §REPORT-TREND-SERVER-AGG.
      const first = months[0];
      const last = months[months.length - 1];
      const { data, error } = await supabase.rpc('get_monthly_trend' as any, {
        p_from_month: first.month,
        p_from_year: first.year,
        p_to_month: last.month,
        p_to_year: last.year,
        p_include_inactive: !!filters.includeInactive,
      } as any);
      if (error) {
        console.error('[useMonthlyTrend] rpc get_monthly_trend failed:', error);
        throw new Error(error.message || 'Failed to fetch monthly trend');
      }

      type RpcRow = {
        employee_id: string;
        full_name: string;
        employee_code: string;
        designation: string;
        department_id: string | null;
        department_name: string;
        business_unit_id: string | null;
        business_unit_name: string;
        reporting_manager_id: string | null;
        reporting_manager_label: string | null;
        is_active: boolean;
        review_year: number;
        review_period: string;
        weighted_score: number | string | null;
        final_only_score: number | string | null;
      };
      const rows = (data ?? []) as RpcRow[];

      // Pivot: one entry per employee, month-keyed score maps.
      const byEmp = new Map<string, { row: RpcRow; scores: Record<string, number | null>; finalScores: Record<string, number | null> }>();
      for (const r of rows) {
        let bucket = byEmp.get(r.employee_id);
        if (!bucket) {
          const scores: Record<string, number | null> = {};
          const finalScores: Record<string, number | null> = {};
          months.forEach(m => { scores[m.key] = null; finalScores[m.key] = null; });
          bucket = { row: r, scores, finalScores };
          byEmp.set(r.employee_id, bucket);
        }
        const key = `${r.review_period}-${r.review_year}`;
        if (key in bucket.scores) {
          const w = r.weighted_score == null ? null : Number(r.weighted_score);
          const f = r.final_only_score == null ? null : Number(r.final_only_score);
          bucket.scores[key] = w != null && Number.isFinite(w) ? w : null;
          bucket.finalScores[key] = f != null && Number.isFinite(f) ? f : null;
        }
      }

      const employees: TrendEmployee[] = Array.from(byEmp.values()).map(({ row, scores, finalScores }) => {
        const orderedVals: number[] = [];
        const orderedFinalVals: number[] = [];
        months.forEach(m => {
          const v = scores[m.key]; if (v != null) orderedVals.push(v);
          const f = finalScores[m.key]; if (f != null) orderedFinalVals.push(f);
        });
        const avg = orderedVals.length
          ? Math.round((orderedVals.reduce((a, b) => a + b, 0) / orderedVals.length) * 100) / 100
          : null;
        const finalOnlyAvg = orderedFinalVals.length
          ? Math.round((orderedFinalVals.reduce((a, b) => a + b, 0) / orderedFinalVals.length) * 100) / 100
          : null;
        let trend: TrendEmployee['trend'] = 'na';
        if (orderedVals.length >= 2) {
          const delta = orderedVals[orderedVals.length - 1] - orderedVals[0];
          trend = Math.abs(delta) < 0.05 ? 'flat' : (delta > 0 ? 'up' : 'down');
        } else if (orderedVals.length === 1) {
          trend = 'flat';
        }
        return {
          id: row.employee_id,
          fullName: row.full_name || 'Unknown',
          employeeCode: row.employee_code || '',
          designation: row.designation || '',
          departmentName: row.department_name || '',
          businessUnitId: row.business_unit_id ?? null,
          businessUnitName: row.business_unit_name || '',
          reportingManagerName: row.reporting_manager_label ?? null,
          isActive: row.is_active !== false,
          monthlyScores: scores,
          monthlyFinalScores: finalScores,
          avg,
          finalOnlyAvg,
          trend,
        };
      });

      employees.sort((a, b) => a.fullName.localeCompare(b.fullName));
      return { months, employees, capped };
    },
    enabled: filters.enabled !== false && !!filters.fromMonth && !!filters.toMonth,
    // Keep cache lifetime short: the previous 5-min staleTime made a single
    // failed fetch (returning 93 employees with all-null cells) survive long
    // after the underlying bug was fixed.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}
