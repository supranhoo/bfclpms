import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo, useState } from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const;
type MonthKey = typeof MONTH_KEYS[number];

export interface EmployeeMatrixRow {
  employeeId: string;
  name: string;
  code: string;
  grade: string;
  designation: string;
  department: string;
  businessUnit: string;
  division: string;
  departmentId: string | null;
  businessUnitId: string | null;
  divisionId: string | null;
  firstMappedMonth: string | null;
  months: Record<MonthKey, boolean>;
}

export interface KpiMappingFilters {
  year: number;
  divisionId: string;
  businessUnitId: string;
  departmentId: string;
  grade: string;
  designation: string;
  search: string;
}

const PAGE_SIZE = 20;

export function useKpiMappingMatrix(filters: KpiMappingFilters, page: number) {
  // Fetch profiles with hierarchy
  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ['kpi-mapping-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, full_name, employee_code, pms_grade, designation, department_id,
          departments (id, name, business_units (id, name, divisions (id, name)))
        `)
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch KPIs for the selected year
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['kpi-mapping-kpis', filters.year],
    queryFn: async () => {
      let allKpis: { employee_id: string; review_period: string }[] = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('kpis')
          .select('employee_id, review_period')
          .eq('review_year', filters.year)
          .range(from, from + batchSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allKpis = allKpis.concat(data);
        if (data.length < batchSize) break;
        from += batchSize;
      }
      return allKpis;
    },
  });

  const isLoading = profilesLoading || kpisLoading;

  // Build the matrix and apply filters
  const { rows, totalCount, totalEmployees, coveragePercent } = useMemo(() => {
    if (!profiles || !kpis) return { rows: [], totalCount: 0, totalEmployees: 0, coveragePercent: 0 };

    // Build employee → month set
    const employeeMonths = new Map<string, Set<number>>();
    for (const kpi of kpis) {
      if (!kpi.review_period || !kpi.employee_id) continue;
      const monthIdx = MONTH_NAMES.indexOf(kpi.review_period as any);
      if (monthIdx === -1) continue;
      if (!employeeMonths.has(kpi.employee_id)) {
        employeeMonths.set(kpi.employee_id, new Set());
      }
      employeeMonths.get(kpi.employee_id)!.add(monthIdx);
    }

    // Build full rows
    let allRows: EmployeeMatrixRow[] = profiles.map((p: any) => {
      const dept = p.departments;
      const bu = dept?.business_units;
      const div = bu?.divisions;
      const monthSet = employeeMonths.get(p.id) || new Set<number>();
      const monthsObj = {} as Record<MonthKey, boolean>;
      let firstIdx = -1;
      MONTH_KEYS.forEach((key, idx) => {
        const has = monthSet.has(idx);
        monthsObj[key] = has;
        if (has && firstIdx === -1) firstIdx = idx;
      });

      return {
        employeeId: p.id,
        name: p.full_name || '',
        code: p.employee_code || '',
        grade: p.pms_grade || '',
        designation: p.designation || '',
        department: dept?.name || '',
        businessUnit: bu?.name || '',
        division: div?.name || '',
        departmentId: p.department_id,
        businessUnitId: bu?.id || null,
        divisionId: div?.id || null,
        firstMappedMonth: firstIdx >= 0 ? MONTH_NAMES[firstIdx] : null,
        months: monthsObj,
      };
    });

    // Apply filters
    if (filters.divisionId) {
      allRows = allRows.filter(r => r.divisionId === filters.divisionId);
    }
    if (filters.businessUnitId) {
      allRows = allRows.filter(r => r.businessUnitId === filters.businessUnitId);
    }
    if (filters.departmentId) {
      allRows = allRows.filter(r => r.departmentId === filters.departmentId);
    }
    if (filters.grade) {
      allRows = allRows.filter(r => r.grade === filters.grade);
    }
    if (filters.designation) {
      allRows = allRows.filter(r => r.designation === filters.designation);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      allRows = allRows.filter(r =>
        r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
      );
    }

    const totalCount = allRows.length;

    // Coverage: count employees with at least one mapped month
    const mappedCount = allRows.filter(r => Object.values(r.months).some(Boolean)).length;
    const coveragePercent = totalCount > 0 ? Math.round((mappedCount / totalCount) * 100) : 0;

    // Paginate
    const start = (page - 1) * PAGE_SIZE;
    const rows = allRows.slice(start, start + PAGE_SIZE);

    return { rows, totalCount, totalEmployees: totalCount, coveragePercent };
  }, [profiles, kpis, filters, page]);

  return {
    rows,
    totalCount,
    totalEmployees,
    coveragePercent,
    isLoading,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
  };
}
