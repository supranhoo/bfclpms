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
  /** Short criteria/description text from kpis.criteria (first occurrence) */
  description: string;
  /** Base weightage (first occurrence) */
  weightage: number;
  /** employee_id → assigned weightage % */
  employeeWeightages: Record<string, number>;
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

export interface MatrixScopePreview {
  employeeCount: number;
  uniqueKpiCount: number;
  totalCells: number;
  exceedsCap: boolean;
}

/** Hard cap on rendered cells — matches PRD v1.1 click-to-load policy */
export const MATRIX_CELL_CAP = 25_000;

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

// ─── RPC helpers ────────────────────────────────────────────

async function fetchScope(filters: MatrixFilters): Promise<Array<{ employee_id: string; kpi_count: number }>> {
  const { data, error } = await supabase.rpc('rpc_kpi_employee_matrix_scope', {
    p_period: filters.reviewPeriod,
    p_year: filters.reviewYear,
    p_division_id: filters.divisionId || null,
    p_bu_id: filters.businessUnitId || null,
    p_dept_id: filters.departmentId || null,
    p_category_id: filters.categoryId || null,
    p_search: filters.search || null,
  });
  if (error) throw error;
  return (data || []) as Array<{ employee_id: string; kpi_count: number }>;
}

/**
 * Lightweight preview — returns employee/KPI counts without paying the
 * cost of fetching profile metadata or submissions. Drives the "Load
 * Matrix" affordance so admins see scope before paying CPU.
 */
export function useKpiEmployeeMatrixScope(filters: MatrixFilters) {
  return useQuery({
    queryKey: ['kpi-employee-matrix-scope', filters],
    queryFn: async (): Promise<MatrixScopePreview> => {
      const rows = await fetchScope(filters);
      const employeeCount = rows.length;
      const uniqueKpiCount = rows.reduce((acc, r) => acc + Number(r.kpi_count || 0), 0);
      // Cells are employees × distinct (kra,kpi) — we don't know distinct count
      // server-side without an extra query, so we use total KPI rows as the
      // upper-bound cell estimate. This is conservative (over-counts), which
      // is the right side to err on for a cap.
      const totalCells = uniqueKpiCount;
      return {
        employeeCount,
        uniqueKpiCount,
        totalCells,
        exceedsCap: totalCells > MATRIX_CELL_CAP,
      };
    },
    enabled: !!filters.reviewPeriod && !!filters.reviewYear,
    staleTime: 60_000,
  });
}

// ─── Main hook ──────────────────────────────────────────────

export function useKpiEmployeeMatrix(filters: MatrixFilters, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false
    && !!filters.reviewPeriod
    && !!filters.reviewYear;
  return useQuery({
    queryKey: ['kpi-employee-matrix', filters],
    queryFn: async () => {
      // ── 1. Server-side scope: who has KPIs in this filter set? ──
      const scopeRows = await fetchScope(filters);
      const employeeIds = scopeRows.map(r => r.employee_id);

      if (employeeIds.length === 0) {
        return {
          rows: [],
          employees: [],
          summary: { totalKpis: 0, totalEmployees: 0, orphanKpis: 0, avgKpisPerEmployee: 0 },
          exceededCap: false,
        };
      }

      // Cap guard
      const estimatedCells = scopeRows.reduce((a, r) => a + Number(r.kpi_count || 0), 0);
      if (estimatedCells > MATRIX_CELL_CAP) {
        return {
          rows: [],
          employees: [],
          summary: { totalKpis: 0, totalEmployees: employeeIds.length, orphanKpis: 0, avgKpisPerEmployee: 0 },
          exceededCap: true,
        };
      }

      // ── 2. Fetch profile display metadata for those employees ──
      const profileMap = new Map<string, any>();
      for (let i = 0; i < employeeIds.length; i += 500) {
        const batch = employeeIds.slice(i, i + 500);
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, employee_code, department_id, designation, pms_grade, is_active, departments(name)')
          .in('id', batch);
        if (error) throw error;
        (data || []).forEach((p: any) => profileMap.set(p.id, p));
      }

      // ── 3. Fetch KPI rows (no nested profiles join) ──
      const kpiRows: Array<{
        kpi_id: string; employee_id: string; kra_name: string; kpi_name: string;
        description: string | null;
        weightage: number | null; category_id: string | null; category_name: string | null;
      }> = [];
      for (let i = 0; i < employeeIds.length; i += 500) {
        const batch = employeeIds.slice(i, i + 500);
        const { data, error } = await supabase.rpc('rpc_kpi_employee_matrix_rows', {
          p_period: filters.reviewPeriod,
          p_year: filters.reviewYear,
          p_employee_ids: batch,
          p_category_id: filters.categoryId || null,
        });
        if (error) throw error;
        kpiRows.push(...((data || []) as any[]));
      }

      // ── 4. Fetch submissions for these KPI ids ──
      const kpiIds = kpiRows.map(k => k.kpi_id);
      const subMap = new Map<string, any>();
      for (let i = 0; i < kpiIds.length; i += 500) {
        const batch = kpiIds.slice(i, i + 500);
        const { data } = await supabase
          .from('review_submissions')
          .select('kpi_id, final_score, management_score, auditor_score, hr_pms_score, skip_level_score, manager_score, self_score, is_na')
          .in('kpi_id', batch);
        (data ?? []).forEach(s => subMap.set(s.kpi_id, s));
      }

      // ── 5. Build employee map & KPI row pivot ──
      const employeeMap = new Map<string, MatrixEmployee>();
      const kpiRowMap = new Map<string, MatrixKpiRow>(); // key = kra_name|kpi_name

      for (const kpi of kpiRows) {
        const profile = profileMap.get(kpi.employee_id);
        if (!profile) continue;
        const empId = kpi.employee_id;

        if (!employeeMap.has(empId)) {
          employeeMap.set(empId, {
            id: empId,
            fullName: profile.full_name || 'Unknown',
            employeeCode: profile.employee_code || '',
            departmentId: profile.department_id,
            departmentName: profile.departments?.name || '',
            designationId: null,
            designationName: profile.designation || '',
            gradeId: null,
            gradeName: profile.pms_grade || '',
            isActive: profile.is_active !== false,
          });
        }

        // Build KPI row key
        const rowKey = `${kpi.kra_name}|${kpi.kpi_name}`;
        if (!kpiRowMap.has(rowKey)) {
          kpiRowMap.set(rowKey, {
            key: rowKey,
            categoryName: kpi.category_name || 'Uncategorized',
            categoryId: kpi.category_id || '',
            kraName: kpi.kra_name,
            kpiName: kpi.kpi_name,
            description: (kpi.description || '').toString(),
            weightage: Number(kpi.weightage) || 0,
            employeeWeightages: {},
            employeeScores: {},
            employeeCount: 0,
          });
        }

        const row = kpiRowMap.get(rowKey)!;

        // Calculate weighted score
        const sub = subMap.get(kpi.kpi_id);
        let cellValue: number | null = null;
        if (sub && !sub.is_na) {
          const bestScore = getBestScore(sub);
          if (bestScore != null) {
            cellValue = Math.round(bestScore * (Number(kpi.weightage) || 0)) / 100;
            cellValue = Math.round(cellValue * 100) / 100;
          }
        }

        row.employeeWeightages[empId] = Number(kpi.weightage) || 0;
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
        exceededCap: false,
      };
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
