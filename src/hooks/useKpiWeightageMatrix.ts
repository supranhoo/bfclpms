import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface KpiMonthWeightage {
  kpiId: string;
  month: string;
  weightage: number | null;
}

export interface KpiRow {
  kpiName: string;
  kraName: string;
  categoryName: string;
  categoryId: string;
  months: Record<string, number | null>; // month -> weightage
  kpiIds: Record<string, string>; // month -> kpi.id
  baselineWeightage: number | null;
  hasMismatch: boolean;
  isAcknowledged: boolean;
}

export interface EmployeeMatrix {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  departmentName: string;
  isActive: boolean;
  kras: Record<string, KpiRow[]>; // kra_name -> KpiRow[]
  monthTotals: Record<string, number>; // month -> total weightage
  activeMonths: string[];
}

// Fiscal year order: July to June
const MONTH_ORDER = ['July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June'];

export interface WeightageMatrixFilters {
  employeeSearch?: string;
  departmentId?: string;
  categoryId?: string;
  includeInactive?: boolean;
}

export interface PaginationArgs {
  page: number;       // 1-based
  pageSize: number;   // 25 / 50 / 100
}

export const WEIGHTAGE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const WEIGHTAGE_DEFAULT_PAGE_SIZE = 25;

/**
 * Paginated KPI Weightage Matrix.
 * Step 1: fetch a page of employees server-side (filters + .range()).
 * Step 2: fetch only those employees' KPIs for the fiscal year and build the matrix.
 * The aggregate variance/acknowledged badges live in `useWeightageVarianceSummary`
 * so they remain accurate across the entire filter set, independent of paging.
 */

/**
 * Returns the distinct set of employee IDs that have at least one KPI mapped
 * in either review_year of the given fiscal cycle (and optional category).
 * Backed by the `rpc_weightage_eligible_employees` Postgres function — one
 * round trip instead of paginating the full `kpis` table client-side.
 */
async function fetchEmployeesWithKpis(
  fiscalStartYear: number,
  categoryId?: string,
): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('rpc_weightage_eligible_employees', {
    p_fiscal_start_year: fiscalStartYear,
    p_category_id: categoryId ?? null,
  });
  if (error) throw error;
  const ids = new Set<string>();
  for (const row of (data || []) as Array<{ employee_id: string }>) {
    if (row?.employee_id) ids.add(row.employee_id);
  }
  return ids;
}

export function useKpiWeightageMatrix(
  fiscalStartYear: number,
  filters: WeightageMatrixFilters | undefined,
  pagination: PaginationArgs,
) {
  const { page, pageSize } = pagination;
  return useQuery({
    queryKey: [
      'kpi-weightage-matrix',
      fiscalStartYear,
      filters?.employeeSearch,
      filters?.departmentId,
      filters?.categoryId,
      filters?.includeInactive,
      page,
      pageSize,
    ],
    queryFn: async () => {
      // ── Step 0: restrict to employees who actually have KRAs/KPIs mapped
      const eligibleIds = await fetchEmployeesWithKpis(fiscalStartYear, filters?.categoryId);
      if (eligibleIds.size === 0) {
        return { employees: [], globalActiveMonths: [], total: 0 };
      }
      const eligibleArr = Array.from(eligibleIds);

      // ── Step 1: paginated employee list (restricted to mapped employees) ─
      let profilesQuery = supabase
        .from('profiles')
        .select('id, full_name, employee_code, department_id, is_active, departments(name)', { count: 'exact' })
        .in('id', eligibleArr)
        .order('full_name', { ascending: true });

      if (!filters?.includeInactive) {
        profilesQuery = profilesQuery.eq('is_active', true);
      }
      if (filters?.departmentId) {
        profilesQuery = profilesQuery.eq('department_id', filters.departmentId);
      }
      if (filters?.employeeSearch) {
        const s = filters.employeeSearch.replace(/[%,]/g, ' ').trim();
        if (s) {
          profilesQuery = profilesQuery.or(`full_name.ilike.%${s}%,employee_code.ilike.%${s}%`);
        }
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data: profileRows, count: total, error: profileErr } = await profilesQuery.range(from, to);
      if (profileErr) throw profileErr;

      const pageProfiles = profileRows || [];
      const pageIds = pageProfiles.map((p: any) => p.id);

      // ── Step 2: fetch KPIs only for this page's employees ──────────────
      const PAGE_SIZE = 1000;
      const fetchYear = async (reviewYear: number) => {
        if (pageIds.length === 0) return [];
        let allKpis: any[] = [];
        let pg = 0;
        let hasMore = true;
        while (hasMore) {
          let query = supabase
            .from('kpis')
            .select(`
              id,
              employee_id,
              kra_name,
              kpi_name,
              weightage,
              weightage_variance_acknowledged,
              review_period,
              category_id,
              kra_categories(name)
            `)
            .eq('review_year', reviewYear)
            .in('employee_id', pageIds)
            .order('employee_id')
            .order('id')
            .range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1);
          if (filters?.categoryId) {
            query = query.eq('category_id', filters.categoryId);
          }
          const { data, error } = await query;
          if (error) throw error;
          allKpis = allKpis.concat(data || []);
          hasMore = (data?.length || 0) === PAGE_SIZE;
          pg++;
        }
        return allKpis;
      };

      const [kpisFirstHalf, kpisSecondHalf] = await Promise.all([
        fetchYear(fiscalStartYear),
        fetchYear(fiscalStartYear + 1),
      ]);
      const allKpis = [...kpisFirstHalf, ...kpisSecondHalf];

      // Seed employee map from the page's profile list so empty employees still render
      const employeeMap = new Map<string, EmployeeMatrix>();
      for (const p of pageProfiles as any[]) {
        employeeMap.set(p.id, {
          employeeId: p.id,
          fullName: p.full_name || 'Unknown',
          employeeCode: p.employee_code || '',
          departmentName: p.departments?.name || 'Unknown',
          isActive: p.is_active !== false,
          kras: {},
          monthTotals: {},
          activeMonths: [],
        });
      }

      for (const kpi of allKpis) {
        const emp = employeeMap.get(kpi.employee_id);
        if (!emp) continue; // KPI for an employee outside this page (shouldn't happen)
        const kraName = kpi.kra_name;
        const month = kpi.review_period || 'Unknown';
        const weightage = kpi.weightage != null ? Number(kpi.weightage) : null;
        const categoryName = (kpi.kra_categories as any)?.name || 'Uncategorized';

        if (!emp.kras[kraName]) {
          emp.kras[kraName] = [];
        }

        // Find or create KPI row
        let kpiRow = emp.kras[kraName].find(r => r.kpiName === kpi.kpi_name);
        if (!kpiRow) {
          kpiRow = {
            kpiName: kpi.kpi_name,
            kraName: kraName,
            categoryName,
            categoryId: kpi.category_id,
            months: {},
            kpiIds: {},
            baselineWeightage: null,
            hasMismatch: false,
            isAcknowledged: false,
          };
          emp.kras[kraName].push(kpiRow);
        }

        kpiRow.months[month] = weightage;
        kpiRow.kpiIds[month] = kpi.id;
        // Track acknowledged — true only if ALL month records are acknowledged
        if (kpi.weightage_variance_acknowledged === true) {
          // Will be finalized in post-processing
          (kpiRow as any)._ackCount = ((kpiRow as any)._ackCount || 0) + 1;
        }
        (kpiRow as any)._totalCount = ((kpiRow as any)._totalCount || 0) + 1;

        // Accumulate month totals
        if (weightage != null) {
          emp.monthTotals[month] = (emp.monthTotals[month] || 0) + weightage;
        }
      }

      // Post-process: compute active months, baseline, mismatches, and sort
      const allMonthsSet = new Set<string>();

      for (const emp of employeeMap.values()) {
        // Collect active months
        const empMonths = new Set<string>();
        for (const kras of Object.values(emp.kras)) {
          for (const kpiRow of kras) {
            for (const m of Object.keys(kpiRow.months)) {
              empMonths.add(m);
              allMonthsSet.add(m);
            }
          }
        }
        emp.activeMonths = MONTH_ORDER.filter(m => empMonths.has(m));

        // Compute baseline and mismatches
        for (const kras of Object.values(emp.kras)) {
          for (const kpiRow of kras) {
            // Baseline = first available month's weightage
            const firstMonth = MONTH_ORDER.find(m => kpiRow.months[m] != null);
            kpiRow.baselineWeightage = firstMonth ? kpiRow.months[firstMonth] : null;

            // Check mismatch
            if (kpiRow.baselineWeightage != null) {
              kpiRow.hasMismatch = Object.entries(kpiRow.months).some(
                ([_, w]) => w != null && w !== kpiRow.baselineWeightage
              );
            }
            // Set acknowledged: true only if all records for this KPI row are acknowledged
            const ackCount = (kpiRow as any)._ackCount || 0;
            const totalCount = (kpiRow as any)._totalCount || 0;
            kpiRow.isAcknowledged = kpiRow.hasMismatch && totalCount > 0 && ackCount === totalCount;
            delete (kpiRow as any)._ackCount;
            delete (kpiRow as any)._totalCount;
          }
        }

        // Sort KRAs alphabetically, KPIs alphabetically within each KRA
        for (const kraName of Object.keys(emp.kras)) {
          emp.kras[kraName].sort((a, b) => a.kpiName.localeCompare(b.kpiName));
        }
      }

      // Sort employees by name
      const employees = Array.from(employeeMap.values()).sort((a, b) =>
        a.fullName.localeCompare(b.fullName)
      );

      const globalActiveMonths = MONTH_ORDER.filter(m => allMonthsSet.has(m));

      return { employees, globalActiveMonths, total: total ?? employees.length };
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Aggregate variance/acknowledged counts for the WHOLE filter set
 * (independent of pagination). Drives the summary badges so the numbers
 * don't change as the admin pages through results.
 */
export function useWeightageVarianceSummary(
  fiscalStartYear: number,
  filters: WeightageMatrixFilters | undefined,
) {
  return useQuery({
    queryKey: [
      'kpi-weightage-variance-summary',
      fiscalStartYear,
      filters?.employeeSearch,
      filters?.departmentId,
      filters?.categoryId,
      filters?.includeInactive,
    ],
    queryFn: async () => {
      // Restrict to employees who actually have KRAs/KPIs mapped.
      const eligibleIds = await fetchEmployeesWithKpis(fiscalStartYear, filters?.categoryId);
      if (eligibleIds.size === 0) {
        return { varianceCount: 0, acknowledgedCount: 0, totalEmployees: 0 };
      }
      const eligibleArr = Array.from(eligibleIds);

      // Resolve eligible employee IDs once (respects the same filter set).
      let profilesQuery = supabase
        .from('profiles')
        .select('id, full_name, employee_code, department_id, is_active', { count: 'exact' })
        .in('id', eligibleArr);
      if (!filters?.includeInactive) profilesQuery = profilesQuery.eq('is_active', true);
      if (filters?.departmentId) profilesQuery = profilesQuery.eq('department_id', filters.departmentId);
      if (filters?.employeeSearch) {
        const s = filters.employeeSearch.replace(/[%,]/g, ' ').trim();
        if (s) profilesQuery = profilesQuery.or(`full_name.ilike.%${s}%,employee_code.ilike.%${s}%`);
      }
      const PAGE = 1000;
      let allProfiles: any[] = [];
      let pg = 0;
      let totalEmployees = 0;
      // Pull all matching IDs (safety-capped to 100k).
      while (pg < 100) {
        const { data, count, error } = await profilesQuery.range(pg * PAGE, (pg + 1) * PAGE - 1);
        if (error) throw error;
        if (count != null) totalEmployees = count;
        const rows = data || [];
        allProfiles = allProfiles.concat(rows);
        if (rows.length < PAGE) break;
        pg++;
      }
      const empIds = allProfiles.map((p) => p.id);
      if (empIds.length === 0) {
        return { varianceCount: 0, acknowledgedCount: 0, totalEmployees: 0 };
      }

      // Pull only the columns we need for variance detection.
      const fetchYear = async (year: number) => {
        const out: any[] = [];
        // Chunk employee IDs for IN() to keep URL length sane.
        const CHUNK = 200;
        for (let i = 0; i < empIds.length; i += CHUNK) {
          const slice = empIds.slice(i, i + CHUNK);
          let q = supabase
            .from('kpis')
            .select('employee_id, kra_name, kpi_name, weightage, weightage_variance_acknowledged, review_period, category_id')
            .eq('review_year', year)
            .in('employee_id', slice);
          if (filters?.categoryId) q = q.eq('category_id', filters.categoryId);
          // Inner page loop (1000 cap)
          let inner = 0;
          while (inner < 100) {
            const { data, error } = await q.range(inner * 1000, (inner + 1) * 1000 - 1);
            if (error) throw error;
            const rows = data || [];
            out.push(...rows);
            if (rows.length < 1000) break;
            inner++;
          }
        }
        return out;
      };

      const [a, b] = await Promise.all([fetchYear(fiscalStartYear), fetchYear(fiscalStartYear + 1)]);
      const allKpis = [...a, ...b];

      // Group by (employee, kra, kpi) → months
      type Key = string;
      const groups = new Map<Key, { months: Record<string, number | null>; ackCount: number; total: number }>();
      for (const k of allKpis) {
        const key = `${k.employee_id}|${k.kra_name}|${k.kpi_name}`;
        const g = groups.get(key) || { months: {}, ackCount: 0, total: 0 };
        g.months[k.review_period || 'Unknown'] = k.weightage != null ? Number(k.weightage) : null;
        if (k.weightage_variance_acknowledged === true) g.ackCount++;
        g.total++;
        groups.set(key, g);
      }

      let varianceCount = 0;
      let acknowledgedCount = 0;
      for (const g of groups.values()) {
        const firstMonth = MONTH_ORDER.find((m) => g.months[m] != null);
        const baseline = firstMonth ? g.months[firstMonth] : null;
        if (baseline == null) continue;
        const hasMismatch = Object.values(g.months).some((w) => w != null && w !== baseline);
        if (!hasMismatch) continue;
        const isAck = g.total > 0 && g.ackCount === g.total;
        if (isAck) acknowledgedCount++;
        else varianceCount++;
      }

      return { varianceCount, acknowledgedCount, totalEmployees };
    },
    staleTime: 5 * 60 * 1000,
  });
}
