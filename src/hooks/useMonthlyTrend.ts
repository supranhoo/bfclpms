import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface MonthKey {
  month: string;
  year: number;
  /** Display label e.g. "Apr 2026" */
  label: string;
  /** Stable key e.g. "April-2026" */
  key: string;
}

export interface TrendEmployee {
  id: string;
  fullName: string;
  employeeCode: string;
  designation: string;
  departmentName: string;
  isActive: boolean;
  /** key (e.g. "April-2026") -> weighted score (0-5) or null */
  monthlyScores: Record<string, number | null>;
  /** Average across non-null months */
  avg: number | null;
  /** Trend last vs first non-null month */
  trend: 'up' | 'down' | 'flat' | 'na';
}

export interface MonthlyTrendFilters {
  fromMonth: string;
  fromYear: number;
  toMonth: string;
  toYear: number;
  search?: string;
  includeInactive?: boolean;
}

export interface MonthlyTrendResult {
  months: MonthKey[];
  employees: TrendEmployee[];
  capped: boolean;
}

const MAX_RANGE = 12;

function bestScore(s: any): number | null {
  return s.final_score
    ?? s.management_score
    ?? s.auditor_score
    ?? s.hr_pms_score
    ?? s.skip_level_score
    ?? s.manager_score
    ?? s.self_score
    ?? null;
}

/** Build inclusive month list from (fromMonth, fromYear) → (toMonth, toYear). */
export function buildMonthRange(
  fromMonth: string,
  fromYear: number,
  toMonth: string,
  toYear: number,
): MonthKey[] {
  const fromIdx = MONTHS.indexOf(fromMonth);
  const toIdx = MONTHS.indexOf(toMonth);
  if (fromIdx === -1 || toIdx === -1) return [];

  let y = fromYear;
  let m = fromIdx;
  const out: MonthKey[] = [];
  // Safety stop at 24 iterations
  for (let i = 0; i < 24; i++) {
    out.push({
      month: MONTHS[m],
      year: y,
      label: `${MONTHS[m].slice(0, 3)} ${y}`,
      key: `${MONTHS[m]}-${y}`,
    });
    if (m === toIdx && y === toYear) break;
    m += 1;
    if (m > 11) { m = 0; y += 1; }
    // If we passed the to date (invalid range), stop
    if (y > toYear || (y === toYear && m > toIdx + 12)) break;
  }
  return out;
}

export function useMonthlyTrend(filters: MonthlyTrendFilters) {
  return useQuery({
    queryKey: [
      'monthly-trend',
      filters.fromMonth, filters.fromYear,
      filters.toMonth, filters.toYear,
      filters.search ?? '',
      filters.includeInactive ?? false,
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

      const PAGE = 1000;

      // Build OR clause for kpis: (review_period=X AND review_year=Y) OR ...
      // Simpler: fetch each month sequentially (small number ≤12).
      type KpiRow = {
        id: string;
        employee_id: string;
        weightage: number | null;
        review_period: string;
        review_year: number;
        profiles: any;
      };

      const allKpis: KpiRow[] = [];
      for (const mk of months) {
        let page = 0;
        let more = true;
        while (more) {
          const { data, error } = await supabase
            .from('kpis')
            .select(`
              id,
              employee_id,
              weightage,
              review_period,
              review_year,
              profiles!kpis_employee_id_fkey(
                full_name, employee_code, designation, department_id, is_active,
                departments(name)
              )
            `)
            .eq('review_period', mk.month)
            .eq('review_year', mk.year)
            .range(page * PAGE, (page + 1) * PAGE - 1);
          if (error) throw error;
          allKpis.push(...((data ?? []) as any));
          more = (data?.length ?? 0) === PAGE;
          page++;
        }
      }

      // Fetch submissions in batches
      const subMap = new Map<string, any>();
      const ids = allKpis.map(k => k.id);
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);
        const { data } = await supabase
          .from('review_submissions')
          .select('kpi_id, final_score, management_score, auditor_score, hr_pms_score, skip_level_score, manager_score, self_score, is_na')
          .in('kpi_id', batch);
        (data ?? []).forEach(s => subMap.set(s.kpi_id, s));
      }

      // Aggregate per employee per month
      type Bucket = { weighted: number; weight: number; any: boolean };
      const empMap = new Map<string, {
        meta: TrendEmployee;
        buckets: Record<string, Bucket>;
      }>();

      for (const kpi of allKpis) {
        const profile = kpi.profiles;
        if (!profile) continue;

        const isActive = profile.is_active !== false;
        if (!filters.includeInactive && !isActive) continue;

        if (filters.search) {
          const s = filters.search.toLowerCase();
          const name = (profile.full_name || '').toLowerCase();
          const code = (profile.employee_code || '').toLowerCase();
          const dept = (profile.departments?.name || '').toLowerCase();
          if (!name.includes(s) && !code.includes(s) && !dept.includes(s)) continue;
        }

        const empId = kpi.employee_id;
        if (!empMap.has(empId)) {
          const buckets: Record<string, Bucket> = {};
          months.forEach(m => { buckets[m.key] = { weighted: 0, weight: 0, any: false }; });
          empMap.set(empId, {
            meta: {
              id: empId,
              fullName: profile.full_name || 'Unknown',
              employeeCode: profile.employee_code || '',
              designation: profile.designation || '',
              departmentName: profile.departments?.name || '',
              isActive,
              monthlyScores: {},
              avg: null,
              trend: 'na',
            },
            buckets,
          });
        }

        const monthKey = `${kpi.review_period}-${kpi.review_year}`;
        const bucket = empMap.get(empId)!.buckets[monthKey];
        if (!bucket) continue;

        const sub = subMap.get(kpi.id);
        if (!sub || sub.is_na) continue;
        const sc = bestScore(sub);
        if (sc === null) continue;
        const w = Number(kpi.weightage) || 0;
        if (w <= 0) return; // skip zero-weight

        bucket.weighted += sc * w;
        bucket.weight += w;
        bucket.any = true;
      }

      const employees: TrendEmployee[] = [];
      for (const { meta, buckets } of empMap.values()) {
        const monthlyScores: Record<string, number | null> = {};
        const valid: number[] = [];
        months.forEach(mk => {
          const b = buckets[mk.key];
          if (b && b.any && b.weight > 0) {
            const v = Math.round((b.weighted / b.weight) * 100) / 100;
            monthlyScores[mk.key] = v;
            valid.push(v);
          } else {
            monthlyScores[mk.key] = null;
          }
        });

        const avg = valid.length > 0
          ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100
          : null;

        // Trend: first vs last non-null in chronological order
        let trend: TrendEmployee['trend'] = 'na';
        const orderedVals: number[] = [];
        months.forEach(mk => {
          const v = monthlyScores[mk.key];
          if (v !== null) orderedVals.push(v);
        });
        if (orderedVals.length >= 2) {
          const first = orderedVals[0];
          const last = orderedVals[orderedVals.length - 1];
          const delta = last - first;
          if (Math.abs(delta) < 0.05) trend = 'flat';
          else trend = delta > 0 ? 'up' : 'down';
        } else if (orderedVals.length === 1) {
          trend = 'flat';
        }

        employees.push({ ...meta, monthlyScores, avg, trend });
      }

      employees.sort((a, b) => a.fullName.localeCompare(b.fullName));

      return { months, employees, capped };
    },
    enabled: !!filters.fromMonth && !!filters.toMonth,
    staleTime: 5 * 60 * 1000,
  });
}
