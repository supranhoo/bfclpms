import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo, useState } from 'react';
import { getCycleOptionsForFrequency } from '@/lib/frequencyCycleOptions';
import { normalizeFrequency } from '@/lib/frequencyUtils';
import { fetchAllPaged } from '@/lib/fetchAll';

// Calendar-order month names (used for DB review_period values)
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

// Fiscal-order month keys (Jul=0 … Jun=11)
const FISCAL_MONTH_KEYS = ['jul','aug','sep','oct','nov','dec','jan','feb','mar','apr','may','jun'] as const;
type MonthKey = typeof FISCAL_MONTH_KEYS[number];

// Map calendar month index (0-based Jan=0) → fiscal index (Jul=0)
const calendarToFiscalIdx = (calIdx: number) => (calIdx + 6) % 12;

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

/**
 * For a non-monthly KPI, resolve which calendar month indices (0-based, Jan=0) it covers.
 * E.g. a Quarterly KPI with review_period='Q1' and cycle_start='Jan-Mar' covers months 0,1,2.
 */
/** Short month names used in cycle labels like "Jan-Mar" */
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function getCalendarMonthsForPeriod(
  reviewPeriod: string,
  rawFrequency: string | null,
  cycleStart: string | null,
): number[] {
  const frequency = normalizeFrequency(rawFrequency);
  if (!frequency) return [];
  const options = getCycleOptionsForFrequency(frequency);
  if (!options) return [];

  // Find the matching cycle option
  const cycleOption = cycleStart
    ? options.find(o => o.value === cycleStart) || options[0]
    : options[0];

  // Parse the sub-frequency to get period labels (e.g. 'Jan-Mar,Apr-Jun,...')
  const periods = cycleOption.subFrequency.split(',');

  // Find the locked months keys that map to this review_period
  const lockedKeys = Object.keys(cycleOption.lockedMonths);

  // Try to match review_period to a locked key (e.g. 'Q1', 'H1', 'Jan-Mar', etc.)
  let matchedKey: string | null = null;

  // Direct match on locked key
  if (lockedKeys.includes(reviewPeriod)) {
    matchedKey = reviewPeriod;
  } else {
    // Try matching period labels like 'Q1' -> index 0 -> first locked key
    // Common patterns: Q1-Q4, H1-H2, or period range labels
    const periodIdx = periods.indexOf(reviewPeriod);
    if (periodIdx !== -1 && periodIdx < lockedKeys.length) {
      matchedKey = lockedKeys[periodIdx];
    }
  }

  if (!matchedKey) return [];

  // The locked months + the active month give us all months in the cycle
  const lockedMonthNums = cycleOption.lockedMonths[matchedKey] || [];
  // Also include the active month for this period
  // Active month is the last month of the first period; for other periods, offset accordingly
  const allMonths = [...lockedMonthNums];

  // Determine the active month for this specific period
  // The active month in cycleOption is for the first period; we need to compute for matching period
  const periodIndex = lockedKeys.indexOf(matchedKey);
  if (periodIndex !== -1) {
    // Parse the period range to find the active (last) month
    const periodLabel = periods[periodIndex];
    if (periodLabel) {
      const parts = periodLabel.split('-');
      const lastMonthName = parts[parts.length - 1];
      const shortIdx = SHORT_MONTHS.indexOf(lastMonthName);
      const lastMonthIdx = shortIdx !== -1 ? shortIdx : MONTH_NAMES.indexOf(lastMonthName as any);
      if (lastMonthIdx !== -1) {
        const monthNum = lastMonthIdx + 1; // 1-based
        if (!allMonths.includes(monthNum)) {
          allMonths.push(monthNum);
        }
      }
    }
  }

  // Convert 1-based month numbers to 0-based calendar indices
  return allMonths.map(m => m - 1);
}

const PAGE_SIZE = 20;

export interface MatrixSortConfig {
  field: 'code' | 'name' | 'grade' | 'designation' | 'department' | 'firstMappedMonth';
  direction: 'asc' | 'desc';
}

export function useKpiMappingMatrix(filters: KpiMappingFilters, page: number, sort?: MatrixSortConfig) {
  // Fetch profiles with hierarchy
  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ['kpi-mapping-profiles'],
    queryFn: async () => {
      // POLICY §94: profiles list reads MUST be paged — PostgREST silently caps at 1000 rows.
      // Without this, the matrix denominator was truncated to ~996 of ~2,533 active employees.
      return await fetchAllPaged<any>((from, to) =>
        supabase
          .from('profiles')
          .select(`
            id, full_name, employee_code, pms_grade, designation, department_id, is_active,
            departments (id, name, business_units (id, name, divisions (id, name)))
          `)
          .order('full_name')
          .range(from, to)
      );
    },
  });

  // Fetch KPIs for the fiscal year (Jul of startYear – Jun of startYear+1)
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['kpi-mapping-kpis', filters.year],
    queryFn: async () => {
      const fetchBatched = async (year: number) => {
        let all: { employee_id: string; review_period: string; frequency: string | null; frequency_cycle_start: string | null }[] = [];
        let from = 0;
        const batchSize = 1000;
        while (true) {
          const { data, error } = await supabase
            .from('kpis')
            .select('employee_id, review_period, frequency, frequency_cycle_start')
            .eq('review_year', year)
            .range(from, from + batchSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all = all.concat(data);
          if (data.length < batchSize) break;
          from += batchSize;
        }
        return all;
      };

      const [h2, h1] = await Promise.all([
        fetchBatched(filters.year),
        fetchBatched(filters.year + 1),
      ]);
      return [...h2, ...h1];
    },
  });

  const isLoading = profilesLoading || kpisLoading;

  // Build the matrix and apply filters
  const { rows, allFilteredRows, orgFilteredRows, totalCount, totalEmployees, mappedEmployees, coveragePercent } = useMemo(() => {
    if (!profiles || !kpis) return { rows: [], allFilteredRows: [], orgFilteredRows: [], totalCount: 0, totalEmployees: 0, mappedEmployees: 0, coveragePercent: 0 };

    // Build employee → fiscal-month-index set
    const employeeMonths = new Map<string, Set<number>>();

    const addMonthForEmployee = (empId: string, calIdx: number) => {
      const fiscalIdx = calendarToFiscalIdx(calIdx);
      if (!employeeMonths.has(empId)) {
        employeeMonths.set(empId, new Set());
      }
      employeeMonths.get(empId)!.add(fiscalIdx);
    };

    for (const kpi of kpis) {
      if (!kpi.review_period || !kpi.employee_id) continue;

      // Try direct month name match first (Monthly / null frequency)
      const calIdx = MONTH_NAMES.indexOf(kpi.review_period as any);
      if (calIdx !== -1) {
        addMonthForEmployee(kpi.employee_id, calIdx);
        continue;
      }

      // Non-monthly KPI: resolve covered months from cycle options
      const coveredMonths = getCalendarMonthsForPeriod(kpi.review_period, kpi.frequency, kpi.frequency_cycle_start);
      for (const cm of coveredMonths) {
        addMonthForEmployee(kpi.employee_id, cm);
      }
    }

    // Build full rows
    let allRows: EmployeeMatrixRow[] = profiles.filter((p: any) => p.is_active !== false).map((p: any) => {
      const dept = p.departments;
      const bu = dept?.business_units;
      const div = bu?.divisions;
      const monthSet = employeeMonths.get(p.id) || new Set<number>();
      const monthsObj = {} as Record<MonthKey, boolean>;
      let firstIdx = -1;
      FISCAL_MONTH_KEYS.forEach((key, idx) => {
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
        firstMappedMonth: firstIdx >= 0 ? MONTH_NAMES[(firstIdx + 6) % 12] : null,
        months: monthsObj,
      };
    });

    // Apply org hierarchy + search filters first (for cascading grade/designation options)
    if (filters.divisionId) {
      allRows = allRows.filter(r => r.divisionId === filters.divisionId);
    }
    if (filters.businessUnitId) {
      allRows = allRows.filter(r => r.businessUnitId === filters.businessUnitId);
    }
    if (filters.departmentId) {
      allRows = allRows.filter(r => r.departmentId === filters.departmentId);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      allRows = allRows.filter(r =>
        r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
      );
    }

    // Snapshot before grade/designation filters for cascading options
    const orgFilteredRows = [...allRows];

    // Apply grade/designation filters
    if (filters.grade) {
      allRows = allRows.filter(r => r.grade === filters.grade);
    }
    if (filters.designation) {
      allRows = allRows.filter(r => r.designation === filters.designation);
    }

    const totalCount = allRows.length;

    // Coverage: count employees with at least one mapped month
    const mappedCount = allRows.filter(r => Object.values(r.months).some(Boolean)).length;
    const coveragePercent = totalCount > 0 ? Math.round((mappedCount / totalCount) * 100) : 0;

    // Sort
    if (sort) {
      const dir = sort.direction === 'asc' ? 1 : -1;
      allRows.sort((a, b) => {
        const av = (a[sort.field] ?? '') as string;
        const bv = (b[sort.field] ?? '') as string;
        return av.localeCompare(bv) * dir;
      });
    }

    const allFilteredRows = [...allRows];

    // Paginate
    const start = (page - 1) * PAGE_SIZE;
    const rows = allRows.slice(start, start + PAGE_SIZE);

    return { rows, allFilteredRows, orgFilteredRows, totalCount, totalEmployees: totalCount, mappedEmployees: mappedCount, coveragePercent };
  }, [profiles, kpis, filters, page, sort]);

  return {
    rows,
    allFilteredRows,
    orgFilteredRows,
    totalCount,
    totalEmployees,
    mappedEmployees,
    coveragePercent,
    isLoading,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
  };
}
