import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ──────────────────────────────────────────────────

export interface MatrixEmployee {
  id: string;
  fullName: string;
  employeeCode: string;
  departmentId: string | null;
  departmentName: string;
  designationId: string | null;
  designationName: string;
  gradeId: string | null;
  gradeName: string;
  isActive: boolean;
}

export interface MatrixKpiRow {
  /** Composite key: kra_name + kpi_name (distinct regardless of employee) */
  key: string;
  categoryName: string;
  categoryId: string;
  kraName: string;
  kpiName: string;
  /** Base weightage (first occurrence) */
  weightage: number;
  /** employee_id → weighted score (weightage × bestScore / 5) or null */
  employeeScores: Record<string, number | null>;
  /** How many employees have this KPI */
  employeeCount: number;
}

export interface MatrixFilters {
  departmentId?: string;
  divisionId?: string;
  businessUnitId?: string;
  categoryId?: string;
  gradeId?: string;
  designationId?: string;
  search?: string;
  reviewPeriod: string;
  reviewYear: number;
}

// ─── Score fallback logic ───────────────────────────────────

function getBestScore(sub: Record<string, any>): number | null {
  return sub.final_score
    ?? sub.management_score
    ?? sub.auditor_score
    ?? sub.hr_pms_score
    ?? sub.skip_level_score
    ?? sub.manager_score
    ?? sub.self_score
    ?? null;
}

// ─── Hook ───────────────────────────────────────────────────

export function useKpiEmployeeMatrix(filters: MatrixFilters) {
  return useQuery({
    queryKey: ['kpi-employee-matrix', filters],
    queryFn: async () => {
      const PAGE_SIZE = 1000;

      // ── 1. Fetch KPIs for the period ──────────────────────
      let allKpis: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const baseQuery = supabase
          .from('kpis')
          .select(`
            id,
            employee_id,
            kra_name,
            kpi_name,
            weightage,
            category_id,
            kra_categories(name),
            profiles!kpis_employee_id_fkey(
              full_name, employee_code, department_id, designation_id,
              pms_grade_id, is_active,
              departments(name),
              designations(name),
              pms_grades(name)
            )
          `)
          .eq('review_period', filters.reviewPeriod)
          .eq('review_year', filters.reviewYear)
          .order('kra_name')
          .order('kpi_name')
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        const q = filters.categoryId ? baseQuery.eq('category_id', filters.categoryId) : baseQuery;

        const { data, error } = await q;
        if (error) throw error;
        allKpis = allKpis.concat(data ?? []);
        hasMore = (data?.length ?? 0) === PAGE_SIZE;
        page++;
      }

      // ── 2. Fetch submissions for these KPI ids ────────────
      const kpiIds = allKpis.map(k => k.id);
      const subMap = new Map<string, any>();

      for (let i = 0; i < kpiIds.length; i += 500) {
        const batch = kpiIds.slice(i, i + 500);
        const { data } = await supabase
          .from('review_submissions')
          .select('kpi_id, final_score, management_score, auditor_score, hr_pms_score, skip_level_score, manager_score, self_score, is_na')
          .in('kpi_id', batch);
        (data ?? []).forEach(s => subMap.set(s.kpi_id, s));
      }

      // ── 3. Build employee set & apply filters ─────────────
      const employeeMap = new Map<string, MatrixEmployee>();
      const kpiRowMap = new Map<string, MatrixKpiRow>(); // key = kra_name|kpi_name

      for (const kpi of allKpis) {
        const profile = kpi.profiles as any;
        if (!profile) continue;

        const empId = kpi.employee_id;
        const deptId = profile.department_id;
        const desigId = profile.designation_id;
        const gradeId = profile.pms_grade_id;

        // Department filter
        if (filters.departmentId && deptId !== filters.departmentId) continue;
        // Grade filter
        if (filters.gradeId && gradeId !== filters.gradeId) continue;
        // Designation filter
        if (filters.designationId && desigId !== filters.designationId) continue;

        // Search filter
        if (filters.search) {
          const s = filters.search.toLowerCase();
          const name = (profile.full_name || '').toLowerCase();
          const code = (profile.employee_code || '').toLowerCase();
          const kpiMatch = kpi.kpi_name.toLowerCase().includes(s);
          const kraMatch = kpi.kra_name.toLowerCase().includes(s);
          if (!name.includes(s) && !code.includes(s) && !kpiMatch && !kraMatch) continue;
        }

        // Register employee
        if (!employeeMap.has(empId)) {
          employeeMap.set(empId, {
            id: empId,
            fullName: profile.full_name || 'Unknown',
            employeeCode: profile.employee_code || '',
            departmentId: deptId,
            departmentName: profile.departments?.name || '',
            designationId: desigId,
            designationName: profile.designations?.name || '',
            gradeId,
            gradeName: profile.pms_grades?.name || '',
            isActive: profile.is_active !== false,
          });
        }

        // Build KPI row key
        const rowKey = `${kpi.kra_name}|${kpi.kpi_name}`;
        if (!kpiRowMap.has(rowKey)) {
          kpiRowMap.set(rowKey, {
            key: rowKey,
            categoryName: (kpi.kra_categories as any)?.name || 'Uncategorized',
            categoryId: kpi.category_id || '',
            kraName: kpi.kra_name,
            kpiName: kpi.kpi_name,
            weightage: Number(kpi.weightage) || 0,
            employeeScores: {},
            employeeCount: 0,
          });
        }

        const row = kpiRowMap.get(rowKey)!;

        // Calculate weighted score
        const sub = subMap.get(kpi.id);
        let cellValue: number | null = null;
        if (sub && !sub.is_na) {
          const bestScore = getBestScore(sub);
          if (bestScore != null) {
            cellValue = Math.round(bestScore * (Number(kpi.weightage) || 0)) / 100;
            cellValue = Math.round(cellValue * 100) / 100;
          }
        }

        row.employeeScores[empId] = cellValue;
      }

      // Compute employee counts
      for (const row of kpiRowMap.values()) {
        row.employeeCount = Object.keys(row.employeeScores).length;
      }

      // Sort rows: category → kra → kpi
      const rows = Array.from(kpiRowMap.values()).sort((a, b) => {
        const catCmp = a.categoryName.localeCompare(b.categoryName);
        if (catCmp !== 0) return catCmp;
        const kraCmp = a.kraName.localeCompare(b.kraName);
        if (kraCmp !== 0) return kraCmp;
        return a.kpiName.localeCompare(b.kpiName);
      });

      // Sort employees by name
      const employees = Array.from(employeeMap.values()).sort((a, b) =>
        a.fullName.localeCompare(b.fullName)
      );

      // Summary stats
      const orphanKpis = rows.filter(r => r.employeeCount === 0).length;
      const avgCoverage = employees.length > 0
        ? Math.round(rows.reduce((sum, r) => sum + r.employeeCount, 0) / employees.length * 10) / 10
        : 0;

      return {
        rows,
        employees,
        summary: {
          totalKpis: rows.length,
          totalEmployees: employees.length,
          orphanKpis,
          avgKpisPerEmployee: avgCoverage,
        },
      };
    },
    enabled: !!filters.reviewPeriod && !!filters.reviewYear,
    staleTime: 5 * 60 * 1000,
  });
}
