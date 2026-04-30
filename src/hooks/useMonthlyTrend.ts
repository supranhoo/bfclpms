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
  reportingManagerName: string | null;
  isActive: boolean;
  monthlyScores: Record<string, number | null>;
  avg: number | null;
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

      const PAGE = 1000;

      // Group months by year so we can batch fetch with .in() on review_period
      const monthsByYear = new Map<number, string[]>();
      months.forEach(mk => {
        if (!monthsByYear.has(mk.year)) monthsByYear.set(mk.year, []);
        monthsByYear.get(mk.year)!.push(mk.month);
      });

      // 1. Fetch all KPIs across the range (batched per year, paginated)
      type KpiRow = {
        id: string;
        employee_id: string;
        weightage: number | null;
        review_period: string;
        review_year: number;
      };

      const allKpis: KpiRow[] = [];
      // Fetch each year in parallel
      await Promise.all(
        Array.from(monthsByYear.entries()).map(async ([year, monthList]) => {
          let page = 0;
          let more = true;
          while (more) {
            const { data, error } = await supabase
              .from('kpis')
              .select('id, employee_id, weightage, review_period, review_year')
              .eq('review_year', year)
              .in('review_period', monthList)
              .range(page * PAGE, (page + 1) * PAGE - 1);
            if (error) throw error;
            allKpis.push(...((data ?? []) as KpiRow[]));
            more = (data?.length ?? 0) === PAGE;
            page++;
          }
        })
      );

      if (allKpis.length === 0) {
        return { months, employees: [], capped };
      }

      // 2. Fetch employee profiles only for the involved employees (in parallel with subs)
      const empIds = Array.from(new Set(allKpis.map(k => k.employee_id)));
      const profileMap = new Map<string, any>();
      const subMap = new Map<string, any>();

      const profilePromise = (async () => {
        for (let i = 0; i < empIds.length; i += 500) {
          const batch = empIds.slice(i, i + 500);
          const { data } = await supabase
            .from('profiles')
            .select('id, full_name, employee_code, designation, department_id, reporting_manager_id, is_active, departments(name)')
            .in('id', batch);
          (data ?? []).forEach((p: any) => profileMap.set(p.id, p));
        }
      })();

      const subsPromise = (async () => {
        const ids = allKpis.map(k => k.id);
        // Keep batch small enough that the resulting `kpi_id=in.(...)` URL
        // stays well under the ~16KB PostgREST/CDN limit (≈ 38 chars per UUID
        // including the `%2C` separator). 200 IDs ≈ 7.6KB of querystring.
        const SUB_BATCH = 200;
        const batches: string[][] = [];
        for (let i = 0; i < ids.length; i += SUB_BATCH) {
          batches.push(ids.slice(i, i + SUB_BATCH));
        }
        // Run batches in parallel (cap concurrency at 4)
        const CONC = 4;
        for (let i = 0; i < batches.length; i += CONC) {
          const slice = batches.slice(i, i + CONC);
          const results = await Promise.all(slice.map(b =>
            supabase
              .from('review_submissions')
              .select('kpi_id, final_score, management_score, auditor_score, hr_pms_score, skip_level_score, manager_score, self_score, is_na')
              .in('kpi_id', b)
          ));
          results.forEach((r) => {
            if (r.error) {
              // Surface partial-fetch failures (e.g. URL-length / 414) instead
              // of silently rendering all dashes.
              console.error('[useMonthlyTrend] submissions batch failed:', r.error);
              throw r.error;
            }
            (r.data ?? []).forEach((s: any) => subMap.set(s.kpi_id, s));
          });
        }
      })();

      await Promise.all([profilePromise, subsPromise]);

      // Fetch reporting manager names (formatted as `Name(Code)`).
      // Filtered .in() lookup — exempt from fetchAllPaged per
      // mem://architecture/profiles-query-policy.
      const managerMap = new Map<string, string>();
      try {
        const managerIds = Array.from(
          new Set(
            Array.from(profileMap.values())
              .map((p: any) => p.reporting_manager_id)
              .filter((id: any): id is string => !!id),
          ),
        );
        if (managerIds.length > 0) {
          for (let i = 0; i < managerIds.length; i += 500) {
            const batch = managerIds.slice(i, i + 500);
            const { data, error } = await supabase
              .from('profiles')
              .select('id, full_name, employee_code')
              .in('id', batch);
            if (error) throw error;
            (data ?? []).forEach((m: any) => {
              const name = m.full_name || 'Unknown';
              const code = m.employee_code;
              managerMap.set(m.id, code ? `${name}(${code})` : name);
            });
          }
        }
      } catch (e) {
        console.warn('[useMonthlyTrend] reporting manager fetch failed:', e);
      }

      // Diagnostic: KPIs returned but zero submissions matched. This is the
      // exact signature of the URL-length / batch-size regression that
      // produced an all-dashes Score Trend table — keep it loud.
      if (allKpis.length > 0 && subMap.size === 0) {
        console.warn(
          '[useMonthlyTrend] Fetched %d KPIs but 0 submissions — possible batch/URL failure.',
          allKpis.length,
        );
      }

      // 3. Aggregate per employee per month
      type Bucket = { weighted: number; weight: number; any: boolean };
      const empAgg = new Map<string, Record<string, Bucket>>();

      for (const kpi of allKpis) {
        const profile = profileMap.get(kpi.employee_id);
        if (!profile) continue;
        if (!filters.includeInactive && profile.is_active === false) continue;

        if (!empAgg.has(kpi.employee_id)) {
          const buckets: Record<string, Bucket> = {};
          months.forEach(m => { buckets[m.key] = { weighted: 0, weight: 0, any: false }; });
          empAgg.set(kpi.employee_id, buckets);
        }

        const monthKey = `${kpi.review_period}-${kpi.review_year}`;
        const bucket = empAgg.get(kpi.employee_id)![monthKey];
        if (!bucket) continue;

        const sub = subMap.get(kpi.id);
        if (!sub || sub.is_na) continue;
        const sc = bestScore(sub);
        if (sc === null) continue;
        const w = Number(kpi.weightage) || 0;
        if (w <= 0) continue;

        bucket.weighted += sc * w;
        bucket.weight += w;
        bucket.any = true;
      }

      // 4. Build employee rows
      const employees: TrendEmployee[] = [];
      for (const [empId, buckets] of empAgg.entries()) {
        const profile = profileMap.get(empId);
        if (!profile) continue;

        const monthlyScores: Record<string, number | null> = {};
        const orderedVals: number[] = [];
        months.forEach(mk => {
          const b = buckets[mk.key];
          if (b && b.any && b.weight > 0) {
            const v = Math.round((b.weighted / b.weight) * 100) / 100;
            monthlyScores[mk.key] = v;
            orderedVals.push(v);
          } else {
            monthlyScores[mk.key] = null;
          }
        });

        const avg = orderedVals.length > 0
          ? Math.round((orderedVals.reduce((a, b) => a + b, 0) / orderedVals.length) * 100) / 100
          : null;

        let trend: TrendEmployee['trend'] = 'na';
        if (orderedVals.length >= 2) {
          const delta = orderedVals[orderedVals.length - 1] - orderedVals[0];
          if (Math.abs(delta) < 0.05) trend = 'flat';
          else trend = delta > 0 ? 'up' : 'down';
        } else if (orderedVals.length === 1) {
          trend = 'flat';
        }

        employees.push({
          id: empId,
          fullName: profile.full_name || 'Unknown',
          employeeCode: profile.employee_code || '',
          designation: profile.designation || '',
          departmentName: profile.departments?.name || '',
          reportingManagerName: profile.reporting_manager_id
            ? (managerMap.get(profile.reporting_manager_id) ?? null)
            : null,
          isActive: profile.is_active !== false,
          monthlyScores,
          avg,
          trend,
        });
      }

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
