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

export function useKpiWeightageMatrix(fiscalStartYear: number, filters?: {
  employeeSearch?: string;
  departmentId?: string;
  categoryId?: string;
  includeInactive?: boolean;
}) {
  return useQuery({
    queryKey: ['kpi-weightage-matrix', fiscalStartYear, filters?.employeeSearch, filters?.departmentId, filters?.categoryId, filters?.includeInactive],
    queryFn: async () => {
      // Fiscal year spans two calendar years: fiscalStartYear (Jul-Dec) and fiscalStartYear+1 (Jan-Jun)
      const PAGE_SIZE = 1000;

      const fetchYear = async (reviewYear: number) => {
        let allKpis: any[] = [];
        let page = 0;
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
              profiles!kpis_employee_id_fkey(full_name, employee_code, department_id, is_active, departments(name)),
              kra_categories(name)
            `)
            .eq('review_year', reviewYear)
            .order('employee_id')
            .order('id')
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

          if (filters?.categoryId) {
            query = query.eq('category_id', filters.categoryId);
          }

          const { data, error } = await query;
          if (error) throw error;

          allKpis = allKpis.concat(data || []);
          hasMore = (data?.length || 0) === PAGE_SIZE;
          page++;
        }
        return allKpis;
      };

      // Fetch both halves of the fiscal year in parallel
      const [kpisFirstHalf, kpisSecondHalf] = await Promise.all([
        fetchYear(fiscalStartYear),       // Jul-Dec
        fetchYear(fiscalStartYear + 1),   // Jan-Jun
      ]);

      const allKpis = [...kpisFirstHalf, ...kpisSecondHalf];

      // Group by employee
      const employeeMap = new Map<string, EmployeeMatrix>();

      for (const kpi of allKpis) {
        const profile = kpi.profiles as any;
        if (!profile) continue;

        const fullName = profile.full_name || 'Unknown';
        const employeeCode = profile.employee_code || '';
        const departmentName = profile.departments?.name || 'Unknown';
        const isActive = profile.is_active !== false;

        // Filter inactive employees unless includeInactive is true
        if (!filters?.includeInactive && !isActive) {
          continue;
        }

        // Apply department filter client-side (embedded resource can't filter server-side)
        if (filters?.departmentId && profile.department_id !== filters.departmentId) {
          continue;
        }

        // Apply employee search filter client-side
        if (filters?.employeeSearch) {
          const search = filters.employeeSearch.toLowerCase();
          if (!fullName.toLowerCase().includes(search) && !employeeCode.toLowerCase().includes(search)) {
            continue;
          }
        }

        const empId = kpi.employee_id;
        if (!employeeMap.has(empId)) {
          employeeMap.set(empId, {
            employeeId: empId,
            fullName,
            employeeCode,
            departmentName,
            isActive,
            kras: {},
            monthTotals: {},
            activeMonths: [],
          });
        }

        const emp = employeeMap.get(empId)!;
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
          };
          emp.kras[kraName].push(kpiRow);
        }

        kpiRow.months[month] = weightage;
        kpiRow.kpiIds[month] = kpi.id;

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

      return { employees, globalActiveMonths };
    },
    staleTime: 5 * 60 * 1000,
  });
}
